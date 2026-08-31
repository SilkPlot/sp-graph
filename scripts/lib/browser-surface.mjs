/**
 * Browser-surface selection and evidence for the performance instruments.
 *
 * Frame measurement and attribution use the same browser-selection contract.
 * Keeping it here prevents a traced diagnostic from accidentally launching a
 * different Chrome surface than the measurement it is meant to explain.
 */
import { arg } from "./perf.mjs";
import { execFileSync } from "node:child_process";
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
			...(mode === "headed"
				? {
						args: [
							"--window-position=5440,80",
							"--window-size=1280,1100",
						],
					}
				: {}),
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
 * Record whether this browser has the named hardware rendering surface.
 * A route-specific observer decides whether headed/headless mode is eligible.
 */
export function classifyBrowserSurface({ instrumented, gpu = {}, webgl = {} }) {
  const ineligibilityReasons = [];
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

  const pageRenderer = typeof webgl.renderer === "string" ? webgl.renderer.trim() : "";
  if (!pageRenderer) {
    ineligibilityReasons.push("page WebGL renderer was not recorded");
  }
  const renderer = [pageRenderer, gpu.auxAttributes?.glRenderer].filter(Boolean).join(" · ");
  const software = softwareRenderer(renderer);
  if (software) {
    ineligibilityReasons.push(`renderer reports a software GPU (${software})`);
  } else if (pageRenderer && !/NVIDIA GeForce RTX 4090/i.test(pageRenderer)) {
    ineligibilityReasons.push(
      "page renderer is not the named NVIDIA GeForce RTX 4090 binding GPU",
    );
  }

  return {
    surfaceEligible: ineligibilityReasons.length === 0,
    classification: ineligibilityReasons.length === 0 ? "binding-candidate" : "diagnostic",
    ineligibilityReasons,
  };
}

const processIdentity = (type, pid) => {
	let cgroupPath = "unavailable";
	let starttime = null;
	try {
		cgroupPath =
			readFileSync(`/proc/${pid}/cgroup`, "utf8")
				.split("\n")
				.find((line) => line.startsWith("0::"))
				?.slice(3) ?? "unavailable";
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const close = stat.lastIndexOf(")");
		starttime = Number(stat.slice(close + 2).trim().split(/\s+/)[19]);
	} catch {
		// A short-lived process can exit between CDP enumeration and /proc.
	}
	return { type, pid, starttime, cgroupPath };
};

/** Snapshot every Chrome process CDP can see, including its kernel identity. */
export async function inspectBrowserProcesses(browser) {
	const cdp = await browser.newBrowserCDPSession();
	try {
		const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
		return {
			inspectedAt: new Date().toISOString(),
			processes: (processInfo ?? []).map(({ type, id }) =>
				processIdentity(type, id),
			),
		};
	} finally {
		await cdp.detach();
	}
}

/** Append a lifecycle snapshot and maintain the complete PID/starttime union. */
export function appendBrowserProcessSnapshot(surface, snapshot) {
	surface.processSnapshots.push(snapshot);
	const byIdentity = new Map(
		surface.processes.map((process) => [
			`${process.pid}:${process.starttime}`,
			process,
		]),
	);
	for (const process of snapshot.processes) {
		const key = `${process.pid}:${process.starttime}`;
		const existing = byIdentity.get(key);
		if (existing) {
			existing.lastObservedAt = snapshot.inspectedAt;
			existing.observedTypes = [
				...new Set([...existing.observedTypes, process.type]),
			].sort();
			existing.observedCgroupPaths = [
				...new Set([...existing.observedCgroupPaths, process.cgroupPath]),
			].sort();
			continue;
		}
		byIdentity.set(key, {
			...process,
			observedTypes: [process.type],
			observedCgroupPaths: [process.cgroupPath],
			firstObservedAt: snapshot.inspectedAt,
			lastObservedAt: snapshot.inspectedAt,
		});
	}
	surface.processes = [...byIdentity.values()].sort(
		(left, right) => left.pid - right.pid || left.starttime - right.starttime,
	);
	surface.processesInspectedAt = snapshot.inspectedAt;
}

/** Select and normalize the compositor client belonging to one marked page. */
export function selectCompositorClient(clients, browserPid, marker) {
	const matches = clients.filter(
		(client) => client?.pid === browserPid && String(client?.title).includes(marker),
	);
	if (matches.length !== 1) {
		throw new Error(
			`expected exactly one Hyprland client for browser PID ${browserPid} and marker '${marker}', found ${matches.length}`,
		);
	}
	const client = matches[0];
	const [x, y] = Array.isArray(client.at) ? client.at : [];
	const [width, height] = Array.isArray(client.size) ? client.size : [];
	return {
		observedAt: new Date().toISOString(),
		address: client.address ?? null,
		pid: client.pid,
		title: client.title ?? null,
		mapped: client.mapped,
		hidden: client.hidden,
		visible: client.visible,
		monitorId: client.monitor,
		position: { x, y },
		size: { width, height },
		xwayland: client.xwayland,
	};
}

const compositorClient = async (page, browserPid, marker) => {
	let lastError;
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			const clients = JSON.parse(
				execFileSync("hyprctl", ["clients", "-j"], {
					encoding: "utf8",
					timeout: 2_000,
					stdio: ["ignore", "pipe", "pipe"],
				}),
			);
			return selectCompositorClient(clients, browserPid, marker);
		} catch (error) {
			lastError = error;
			await page.waitForTimeout(50);
		}
	}
	throw lastError;
};

/** Measure the output and steady-state rAF cadence of the actual headed page. */
export async function inspectDisplaySurface(
	page,
	sampleCount = 120,
	context = "unspecified",
	{ mode = "headless", browserPid = null } = {},
) {
	let originalTitle;
	let marker;
	let compositorBefore;
	if (mode === "headed") {
		if (!Number.isInteger(browserPid) || browserPid <= 0) {
			throw new Error("headed display evidence requires the CDP browser PID");
		}
		originalTitle = await page.title();
		marker = `silkplot-evidence-${context}-${browserPid}-${Date.now()}`;
		await page.evaluate((title) => {
			document.title = title;
		}, marker);
		compositorBefore = await compositorClient(page, browserPid, marker);
	}
	try {
		const reading = await page.evaluate(async (count) => {
		const screenReading = () => ({
			width: screen.width,
			height: screen.height,
			availWidth: screen.availWidth,
			availHeight: screen.availHeight,
			colorDepth: screen.colorDepth,
			pixelDepth: screen.pixelDepth,
			devicePixelRatio,
			screenX,
			screenY,
			outerWidth,
			outerHeight,
			innerWidth,
			innerHeight,
		});
		await new Promise((resolve) => requestAnimationFrame(() => resolve()));
		const startedAt = new Date().toISOString();
		const rafDeltas = [];
		let previous = await new Promise((resolve) => requestAnimationFrame(resolve));
		for (let index = 0; index < count; index++) {
			const next = await new Promise((resolve) => requestAnimationFrame(resolve));
			rafDeltas.push(next - previous);
			previous = next;
		}
		return {
			startedAt,
			endedAt: new Date().toISOString(),
			screen: screenReading(),
			rafDeltas,
		};
		}, sampleCount);
		const compositorAfter =
			mode === "headed"
				? await compositorClient(page, browserPid, marker)
				: undefined;
		return {
			context,
			...reading,
			...(mode === "headed"
				? {
						compositor: {
							marker,
							before: compositorBefore,
							after: compositorAfter,
						},
					}
				: {}),
		};
	} finally {
		if (mode === "headed" && originalTitle !== undefined) {
			await page.evaluate((title) => {
				document.title = title;
			}, originalTitle);
		}
	}
}

/** Read the actual launched browser, GPU feature state, renderer, and OS PIDs. */
export async function inspectBrowserSurface(browser, page, plan, { instrumented = false } = {}) {
  const cdp = await browser.newBrowserCDPSession();
  const { gpu } = await cdp.send("SystemInfo.getInfo");
	await cdp.detach();
	const processSnapshot = await inspectBrowserProcesses(browser);
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
	const browserPid = processSnapshot.processes.find(
		(process) => process.type === "browser",
	)?.pid;
	const displayInitial = await inspectDisplaySurface(page, 120, "probe-initial", {
		mode: plan.mode,
		browserPid,
	});
  const classification = classifyBrowserSurface({
    mode: plan.mode,
    instrumented,
    gpu,
    webgl,
  });

  const surface = {
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
		displayInitial,
		displayFinal: null,
		displaySnapshots: [displayInitial],
		processesInspectedAt: processSnapshot.inspectedAt,
		processSnapshots: [],
		processes: [],
    ...classification,
  };
	appendBrowserProcessSnapshot(surface, processSnapshot);
	appendBrowserProcessSnapshot(surface, await inspectBrowserProcesses(browser));
	return surface;
}
