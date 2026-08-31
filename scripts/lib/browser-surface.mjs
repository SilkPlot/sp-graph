/**
 * Browser-surface selection and evidence for the performance instruments.
 *
 * Frame measurement and attribution use the same browser-selection contract.
 * Keeping it here prevents a traced diagnostic from accidentally launching a
 * different Chrome surface than the measurement it is meant to explain.
 */
import { arg } from "./perf.mjs";
import { readFileSync } from "node:fs";

const SURFACES = new Set(["headless", "headed"]);

/** Parse the public CLI surface and produce Playwright launch options. */
export function browserSurfacePlan(argv) {
  const mode = arg(argv, "browser-surface", "headless");
  if (!SURFACES.has(mode)) {
    throw new Error(`unknown --browser-surface '${mode}'; expected headed or headless`);
  }

  const executablePath = arg(argv, "executable", undefined);
  if (mode === "headed" && !executablePath) {
    throw new Error(
      "--executable PATH is required for a headed run so the exact full Chrome binary is recorded",
    );
  }

  return {
    mode,
    executablePath,
    launchOptions: {
      headless: mode === "headless",
      ...(executablePath ? { executablePath } : {}),
    },
  };
}

const softwareRenderer = (text) => {
  const match = String(text ?? "").match(/swiftshader|llvmpipe|lavapipe|software rasterizer/i);
  if (!match) return undefined;
  const token = match[0].toLowerCase();
  if (token === "swiftshader") return "SwiftShader";
  if (token === "llvmpipe") return "llvmpipe";
  if (token === "lavapipe") return "lavapipe";
  return "software rasterizer";
};

/**
 * Decide only whether the browser surface can be considered for a binding run.
 * Workload verdicts and host eligibility remain separate concerns.
 */
export function classifyBrowserSurface({ mode, instrumented, gpu = {}, webgl = {} }) {
  const ineligibilityReasons = [];
  if (mode !== "headed") {
    ineligibilityReasons.push(
      "browser surface is headless; the binding surface is headed Chrome",
    );
  }
  if (instrumented) {
    ineligibilityReasons.push(
      "instrumentation is active; profiler and trace overhead makes this run diagnostic",
    );
  }

  const features = gpu.featureStatus ?? {};
  if (features.gpu_compositing !== "enabled") {
    ineligibilityReasons.push(
      `GPU compositing is ${features.gpu_compositing ?? "unreported"}, not enabled`,
    );
  }
  if (features.rasterization !== "enabled") {
    ineligibilityReasons.push(
      `GPU rasterization is ${features.rasterization ?? "unreported"}, not enabled`,
    );
  }
  if (features.webgl !== "enabled") {
    ineligibilityReasons.push(`WebGL is ${features.webgl ?? "unreported"}, not enabled`);
  }

  const renderer = [webgl.renderer, gpu.auxAttributes?.glRenderer].filter(Boolean).join(" · ");
  const software = softwareRenderer(renderer);
  if (software) {
    ineligibilityReasons.push(`renderer reports a software GPU (${software})`);
  } else if (!/NVIDIA GeForce RTX 4090/i.test(renderer)) {
    ineligibilityReasons.push(
      "renderer is not the named NVIDIA GeForce RTX 4090 binding GPU",
    );
  }

  return {
    surfaceEligible: ineligibilityReasons.length === 0,
    classification: ineligibilityReasons.length === 0 ? "binding-candidate" : "diagnostic",
    ineligibilityReasons,
  };
}

/** Read the actual launched browser, GPU feature state, renderer, and OS PIDs. */
export async function inspectBrowserSurface(browser, page, plan, { instrumented = false } = {}) {
  const cdp = await browser.newBrowserCDPSession();
  const [{ gpu }, { processInfo }] = await Promise.all([
    cdp.send("SystemInfo.getInfo"),
    cdp.send("SystemInfo.getProcessInfo"),
  ]);
  const processesInspectedAt = new Date().toISOString();
  const webgl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl");
    const extension = context?.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor:
        context && extension
          ? String(context.getParameter(extension.UNMASKED_VENDOR_WEBGL))
          : null,
      renderer:
        context && extension
          ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
          : null,
    };
  });
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const classification = classifyBrowserSurface({
    mode: plan.mode,
    instrumented,
    gpu,
    webgl,
  });

  return {
    requestedMode: plan.mode,
    executablePath: plan.executablePath ?? "Playwright-managed default",
    browserVersion: browser.version(),
    userAgent,
    instrumented,
    gpu: {
      devices: gpu.devices ?? [],
      featureStatus: gpu.featureStatus ?? {},
      renderer: gpu.auxAttributes?.glRenderer ?? null,
      vendor: gpu.auxAttributes?.glVendor ?? null,
      version: gpu.auxAttributes?.glVersion ?? null,
      displayType: gpu.auxAttributes?.displayType ?? null,
      skiaBackendType: gpu.auxAttributes?.skiaBackendType ?? null,
    },
    webgl,
    processesInspectedAt,
    processes: (processInfo ?? []).map(({ type, id }) => {
      let cgroupPath = "unavailable";
      try {
        cgroupPath =
          readFileSync(`/proc/${id}/cgroup`, "utf8")
            .split("\n")
            .find((line) => line.startsWith("0::"))
            ?.slice(3) ?? "unavailable";
      } catch {
        // A short-lived renderer can exit between CDP enumeration and /proc.
      }
      return { type, pid: id, cgroupPath };
    }),
    ...classification,
  };
}
