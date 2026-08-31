import assert from "node:assert/strict";
import test from "node:test";
import {
  browserSurfacePlan,
  classifyBrowserSurface,
  inspectBrowserSurface,
} from "./browser-surface.mjs";

test("the default browser surface is an explicitly diagnostic headless run", () => {
  assert.deepEqual(browserSurfacePlan([]), {
    mode: "headless",
    executablePath: undefined,
    launchOptions: { headless: true },
  });
});

test("headed measurement requires the exact full Chrome executable", () => {
  assert.throws(
    () => browserSurfacePlan(["node", "measure", "--browser-surface", "headed"]),
    /--executable PATH is required/,
  );

  assert.deepEqual(
    browserSurfacePlan([
      "node",
      "measure",
      "--browser-surface",
      "headed",
      "--executable",
      "/opt/chrome/chrome",
    ]),
    {
      mode: "headed",
      executablePath: "/opt/chrome/chrome",
      launchOptions: { headless: false, executablePath: "/opt/chrome/chrome" },
    },
  );
});

test("a headed hardware-accelerated Chrome surface is eligible for binding consideration", () => {
  const result = classifyBrowserSurface({
    mode: "headed",
    instrumented: false,
    gpu: {
      featureStatus: {
        gpu_compositing: "enabled",
        rasterization: "enabled",
        webgl: "enabled",
      },
      auxAttributes: {
        glRenderer:
          "ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL ES 3.2 NVIDIA 610.57.04)",
      },
    },
    webgl: {
      vendor: "Google Inc. (NVIDIA Corporation)",
      renderer: "ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2)",
    },
  });

  assert.equal(result.surfaceEligible, true);
  assert.equal(result.classification, "binding-candidate");
  assert.deepEqual(result.ineligibilityReasons, []);
});

test("headless, software rendering, and tracing each make a run diagnostic", () => {
  const result = classifyBrowserSurface({
    mode: "headless",
    instrumented: true,
    gpu: {
      featureStatus: {
        gpu_compositing: "disabled_software",
        rasterization: "disabled_software",
        webgl: "enabled",
      },
      auxAttributes: {
        glRenderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
      },
    },
    webgl: {
      vendor: "Google Inc. (Google)",
      renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
    },
  });

  assert.equal(result.surfaceEligible, false);
  assert.equal(result.classification, "diagnostic");
  assert.deepEqual(result.ineligibilityReasons, [
    "browser surface is headless; the binding surface is headed Chrome",
    "instrumentation is active; profiler and trace overhead makes this run diagnostic",
    "GPU compositing is disabled_software, not enabled",
    "GPU rasterization is disabled_software, not enabled",
    "renderer reports a software GPU (SwiftShader)",
	]);
});

test("a different hardware GPU does not satisfy the named RTX 4090 binding surface", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: {
				glRenderer:
					"ANGLE (Intel, Intel(R) UHD Graphics 770, OpenGL ES 3.2)",
			},
		},
		webgl: {
			renderer: "ANGLE (Intel, Intel(R) UHD Graphics 770)",
		},
	});

	assert.equal(result.surfaceEligible, false);
	assert.deepEqual(result.ineligibilityReasons, [
		"renderer is not the named NVIDIA GeForce RTX 4090 binding GPU",
	]);
});

test("browser process evidence records when the CDP snapshot was observed", async () => {
	let evaluation = 0;
	const browser = {
		newBrowserCDPSession: async () => ({
			send: async (method) =>
				method === "SystemInfo.getInfo"
					? {
							gpu: {
								featureStatus: {
									gpu_compositing: "enabled",
									rasterization: "enabled",
									webgl: "enabled",
								},
								auxAttributes: {
									glRenderer: "NVIDIA GeForce RTX 4090",
								},
							},
						}
					: { processInfo: [{ type: "browser", id: 999_999_999 }] },
		}),
		version: () => "151.0.7922.34",
	};
	const page = {
		evaluate: async () => {
			evaluation++;
			return evaluation === 1
				? { vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 4090" }
				: "Chrome/151.0.0.0";
		},
	};

	const surface = await inspectBrowserSurface(
		browser,
		page,
		{ mode: "headed", executablePath: "/opt/chrome" },
		{ instrumented: false },
	);

	assert.equal(Number.isNaN(Date.parse(surface.processesInspectedAt)), false);
});
