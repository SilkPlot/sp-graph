import assert from "node:assert/strict";
import test from "node:test";
import {
	appendBrowserProcessSnapshot,
  browserSurfacePlan,
  classifyBrowserSurface,
  inspectBrowserSurface,
	pinCompositorClient,
	selectCompositorClient,
} from "./browser-surface.mjs";

test("later renderer snapshots extend the complete browser process surface", () => {
	const surface = { processSnapshots: [], processes: [] };
	appendBrowserProcessSnapshot(surface, {
		inspectedAt: "2026-08-31T10:00:00.000Z",
		processes: [
			{
				type: "browser",
				pid: 42,
				starttime: 100,
				cgroupPath: "/browser.scope",
			},
		],
	});
	appendBrowserProcessSnapshot(surface, {
		inspectedAt: "2026-08-31T10:00:01.000Z",
		processes: [
			{
				type: "renderer",
				pid: 84,
				starttime: 200,
				cgroupPath: "/renderer.scope",
			},
		],
	});

	assert.deepEqual(surface.processes.map(({ pid }) => pid), [42, 84]);
	assert.equal(surface.processes[1].firstObservedAt, "2026-08-31T10:00:01.000Z");
});

test("a browser identity retains every observed type and cgroup path", () => {
	const surface = { processSnapshots: [], processes: [] };
	appendBrowserProcessSnapshot(surface, {
		inspectedAt: "2026-08-31T10:00:00.000Z",
		processes: [
			{ type: "browser", pid: 42, starttime: 100, cgroupPath: "/run.scope" },
		],
	});
	appendBrowserProcessSnapshot(surface, {
		inspectedAt: "2026-08-31T10:00:01.000Z",
		processes: [
			{
				type: "browser",
				pid: 42,
				starttime: 100,
				cgroupPath: "/sibling.scope",
			},
		],
	});

	assert.deepEqual(surface.processes[0].observedTypes, ["browser"]);
	assert.deepEqual(surface.processes[0].observedCgroupPaths, [
		"/run.scope",
		"/sibling.scope",
	]);
});

test("the compositor client is tied to the marked page and exact browser PID", () => {
	const selected = selectCompositorClient(
		[
			{ pid: 42, title: "another page", address: "0x1" },
			{
				pid: 42,
				title: "silkplot-evidence-probe - Google Chrome for Testing",
				address: "0x2",
				mapped: true,
				hidden: false,
				visible: true,
				monitor: 2,
				at: [6647, 38],
				size: [1261, 1390],
				xwayland: false,
			},
		],
		42,
		"silkplot-evidence-probe",
	);

	assert.equal(selected.address, "0x2");
	assert.equal(selected.monitorId, 2);
	assert.deepEqual(selected.position, { x: 6647, y: 38 });
	assert.deepEqual(selected.size, { width: 1261, height: 1390 });
	assert.throws(
		() =>
			selectCompositorClient(
				[
					{ pid: 42, title: "silkplot-evidence-probe", address: "0x2" },
					{ pid: 42, title: "silkplot-evidence-probe", address: "0x3" },
				],
				42,
				"silkplot-evidence-probe",
			),
		/exactly one Hyprland client/,
	);
});

test("a headed evidence window is pinned to the frozen output by address", () => {
	const calls = [];
	const dispatch = (...args) => calls.push(args);
	assert.equal(
		pinCompositorClient(
			{ address: "0xabc123", monitorId: 1 },
			{ dispatch },
		),
		true,
	);
	assert.deepEqual(calls, [
		[
			"hyprctl",
			[
				"dispatch",
				'hl.dsp.window.move({ monitor = "DP-2", follow = false, window = "address:0xabc123" })',
			],
			{
				encoding: "utf8",
				timeout: 2_000,
				stdio: ["ignore", "pipe", "pipe"],
			},
		],
	]);

	calls.length = 0;
	assert.equal(
		pinCompositorClient(
			{ address: "0xabc123", monitorId: 2 },
			{ dispatch },
		),
		false,
	);
	assert.deepEqual(calls, []);
	assert.throws(
		() => pinCompositorClient({ address: "not-an-address", monitorId: 1 }),
		/valid Hyprland address/,
	);
});

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
      launchOptions: {
			headless: false,
			executablePath: "/opt/chrome/chrome",
			args: ["--window-position=5440,80", "--window-size=1280,1100"],
		},
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

test("browser evidence stays context-neutral for a hardware-accelerated headless surface", () => {
	const result = classifyBrowserSurface({
		mode: "headless",
		instrumented: false,
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: { glRenderer: "NVIDIA GeForce RTX 4090" },
		},
		webgl: { renderer: "NVIDIA GeForce RTX 4090" },
	});

	assert.equal(result.surfaceEligible, true);
	assert.equal(result.classification, "binding-candidate");
	assert.deepEqual(result.ineligibilityReasons, []);
});

test("software rendering and tracing make a headless run diagnostic", () => {
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
		"page renderer is not the named NVIDIA GeForce RTX 4090 binding GPU",
	]);
});

test("an RTX auxiliary record cannot mask a different page renderer", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: { glRenderer: "NVIDIA GeForce RTX 4090" },
		},
		webgl: { renderer: "Intel(R) UHD Graphics 770" },
	});

	assert.equal(result.surfaceEligible, false);
	assert.match(result.ineligibilityReasons.join("\n"), /page renderer is not/);
});

test("the binding surface requires a page-level WebGL renderer reading", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: { glRenderer: "NVIDIA GeForce RTX 4090" },
		},
		webgl: { vendor: null, renderer: null },
	});

	assert.equal(result.surfaceEligible, false);
	assert.match(result.ineligibilityReasons.join("\n"), /page WebGL renderer/);
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
			detach: async () => {},
		}),
		version: () => "151.0.7922.34",
	};
	const page = {
		evaluate: async (_callback, argument) => {
			evaluation++;
			if (evaluation === 1) {
				return { vendor: "NVIDIA", renderer: "NVIDIA GeForce RTX 4090" };
			}
			if (evaluation === 2) return "Chrome/151.0.0.0";
			assert.equal(argument, 120);
			return {
				startedAt: "2026-08-31T10:00:00.000Z",
				endedAt: "2026-08-31T10:00:02.000Z",
				screen: { width: 2560, height: 1440 },
				rafDeltas: Array.from({ length: 120 }, () => 16.68),
			};
		},
	};

	const surface = await inspectBrowserSurface(
		browser,
		page,
		{ mode: "headless", executablePath: "/opt/chrome" },
		{ instrumented: false },
	);

	assert.equal(Number.isNaN(Date.parse(surface.processesInspectedAt)), false);
});
