import assert from "node:assert/strict";
import test from "node:test";
import {
	appendBrowserProcessSnapshot,
  browserSurfacePlan,
  classifyBrowserSurface,
	FROZEN_HEADED_WINDOW,
	FROZEN_HEADED_WINDOW_DARWIN,
	headedChromeArgs,
  inspectBrowserSurface,
	inspectDisplaySurface,
	pinCompositorClient,
	resolveCompositorBackend,
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

test("linux resolves to the hyprland compositor backend and darwin to aqua", () => {
	assert.equal(resolveCompositorBackend("linux"), "hyprland");
	assert.equal(resolveCompositorBackend("darwin"), "darwin-aqua");
	assert.equal(resolveCompositorBackend("win32"), "unsupported");
});

test("darwin headed display inspect never spawns hyprctl and records frozen Aqua sizes", async () => {
	const calls = [];
	let title = "original";
	let pinCalls = 0;
	const frozenScreen = {
		width: 1512,
		height: 982,
		availWidth: 1512,
		availHeight: 982,
		colorDepth: 30,
		pixelDepth: 30,
		devicePixelRatio: 2,
		screenX: 80,
		screenY: 80,
		outerWidth: 1280,
		outerHeight: 780,
		innerWidth: 1200,
		innerHeight: 680,
	};
	const page = {
		title: async () => title,
		waitForTimeout: async () => {},
		evaluate: async (callback, argument) => {
			if (typeof callback === "function" && callback.length === 1 && typeof argument === "string") {
				title = argument;
				return undefined;
			}
			// pin path reads outer bounds with a zero-arg evaluate
			if (typeof callback === "function" && argument === undefined) {
				return {
					outerWidth: frozenScreen.outerWidth,
					outerHeight: frozenScreen.outerHeight,
					screenX: frozenScreen.screenX,
					screenY: frozenScreen.screenY,
					devicePixelRatio: frozenScreen.devicePixelRatio,
				};
			}
			assert.equal(argument, 3);
			return {
				startedAt: "2026-09-15T12:00:00.000Z",
				endedAt: "2026-09-15T12:00:01.000Z",
				screen: frozenScreen,
				rafDeltas: [16.6, 16.7, 16.5],
			};
		},
	};

	const reading = await inspectDisplaySurface(page, 3, "probe-darwin", {
		mode: "headed",
		browserPid: 14447,
		platform: "darwin",
		pinFrozenWindow: async () => {
			pinCalls += 1;
		},
		execFile: (command, args) => {
			calls.push([command, args]);
			throw new Error(`hyprctl must not run on Darwin: ${command} ${args}`);
		},
	});

	assert.equal(pinCalls, 1);
	assert.deepEqual(calls, []);
	assert.equal(reading.compositor.backend, "darwin-aqua");
	assert.equal(reading.compositor.hyprlandSkipped, undefined);
	assert.deepEqual(reading.compositor.before.size, {
		width: FROZEN_HEADED_WINDOW_DARWIN.width,
		height: FROZEN_HEADED_WINDOW_DARWIN.height,
	});
	assert.deepEqual(reading.compositor.after.size, {
		width: FROZEN_HEADED_WINDOW_DARWIN.width,
		height: FROZEN_HEADED_WINDOW_DARWIN.height,
	});
	assert.match(reading.compositor.marker, /^silkplot-evidence-probe-darwin-14447-/);
	assert.deepEqual(reading.rafDeltas, [16.6, 16.7, 16.5]);
	assert.equal(title, "original");

});

test("linux headed display inspect still pins and selects via hyprctl", async () => {
	const calls = [];
	let title = "original";
	const clientOnOne = {
		pid: 42,
		title: "silkplot-evidence-probe-linux",
		address: "0xabc123",
		mapped: true,
		hidden: false,
		visible: true,
		monitor: 1,
		at: [100, 80],
		size: [1280, 1100],
		xwayland: false,
	};
	const clientOnTwo = { ...clientOnOne, monitor: 2, at: [5440, 80] };
	let clientsPayload = JSON.stringify([clientOnOne]);

	const page = {
		title: async () => title,
		waitForTimeout: async () => {},
		evaluate: async (callback, argument) => {
			if (typeof callback === "function" && callback.length === 1 && typeof argument === "string") {
				title = argument;
				clientOnOne.title = argument;
				clientOnTwo.title = argument;
				clientsPayload = JSON.stringify([
					clientsPayload.includes('"monitor":2') ? clientOnTwo : clientOnOne,
				]);
				return undefined;
			}
			assert.equal(argument, 2);
			return {
				startedAt: "2026-09-15T12:00:00.000Z",
				endedAt: "2026-09-15T12:00:01.000Z",
				screen: { width: 2560, height: 1440 },
				rafDeltas: [16.67, 16.67],
			};
		},
	};

	const execFile = (command, args, options) => {
		calls.push([command, args, options]);
		assert.equal(command, "hyprctl");
		if (args[0] === "clients") {
			return clientsPayload.includes('"monitor":2')
				? JSON.stringify([clientOnTwo])
				: JSON.stringify([clientOnOne]);
		}
		if (args[0] === "dispatch") {
			clientsPayload = JSON.stringify([clientOnTwo]);
			return "";
		}
		throw new Error(`unexpected hyprctl args: ${JSON.stringify(args)}`);
	};

	const reading = await inspectDisplaySurface(page, 2, "probe-linux", {
		mode: "headed",
		browserPid: 42,
		platform: "linux",
		execFile,
	});

	assert.ok(calls.some(([command, args]) => command === "hyprctl" && args[0] === "clients"));
	assert.deepEqual(
		calls.find(([command, args]) => command === "hyprctl" && args[0] === "dispatch")?.slice(0, 2),
		[
			"hyprctl",
			[
				"dispatch",
				'hl.dsp.window.move({ monitor = "DP-2", follow = false, window = "address:0xabc123" })',
			],
		],
	);
	assert.equal(reading.compositor.before.monitorId, 2);
	assert.equal(reading.compositor.after.monitorId, 2);
	assert.equal(reading.compositor.before.address, "0xabc123");
	assert.equal(reading.compositor.backend, undefined);
	assert.equal(reading.compositor.hyprlandSkipped, undefined);
	assert.deepEqual(reading.rafDeltas, [16.67, 16.67]);
	assert.equal(title, "original");
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
    browserSurfacePlan(
      [
        "node",
        "measure",
        "--browser-surface",
        "headed",
        "--executable",
        "/opt/chrome/chrome",
      ],
      { platform: "linux" },
    ),
    {
      mode: "headed",
      executablePath: "/opt/chrome/chrome",
      launchOptions: {
			headless: false,
			executablePath: "/opt/chrome/chrome",
			args: headedChromeArgs("linux"),
		},
    },
  );

  assert.deepEqual(
    browserSurfacePlan(
      [
        "node",
        "measure",
        "--browser-surface",
        "headed",
        "--executable",
        "/opt/chrome/chrome",
      ],
      { platform: "darwin" },
    ).launchOptions.args,
    [
      "--window-position=80,80",
      "--window-size=1280,780",
      "--force-device-scale-factor=2",
      "--class=silkplot-perf",
    ],
  );
  assert.doesNotMatch(headedChromeArgs("darwin").join(" "), /5440/);
  assert.match(headedChromeArgs("linux").join(" "), /5440/);
});

test("a headed hardware-accelerated Chrome surface is eligible for binding consideration", () => {
  const result = classifyBrowserSurface({
    mode: "headed",
    instrumented: false,
    platform: "linux",
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
		platform: "linux",
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
		platform: "linux",
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

test("darwin ANGLE Metal Apple M1 is a binding-candidate surface", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		platform: "darwin",
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: {
				glRenderer:
					"ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
			},
		},
		webgl: {
			vendor: "Google Inc. (Apple)",
			renderer:
				"ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
		},
	});

	assert.equal(result.surfaceEligible, true);
	assert.equal(result.classification, "binding-candidate");
	assert.deepEqual(result.ineligibilityReasons, []);
});

test("darwin SwiftShader remains a diagnostic software GPU", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		platform: "darwin",
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: {
				glRenderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
			},
		},
		webgl: {
			renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))",
		},
	});

	assert.equal(result.surfaceEligible, false);
	assert.equal(result.classification, "diagnostic");
	assert.match(result.ineligibilityReasons.join("\n"), /software GPU \(SwiftShader\)/);
});

test("darwin Apple-without-Metal page renderer fails the Darwin named GPU gate", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		platform: "darwin",
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: {
				glRenderer: "Apple M1 GPU",
			},
		},
		webgl: {
			vendor: "Apple Inc.",
			renderer: "Apple M1 GPU",
		},
	});

	assert.equal(result.surfaceEligible, false);
	assert.equal(result.classification, "diagnostic");
	assert.deepEqual(result.ineligibilityReasons, [
		"page renderer is not Apple Metal / ANGLE Metal on the Darwin named host",
	]);
});

test("darwin Metal-alone without Apple or ANGLE fails the Darwin named GPU gate", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		platform: "darwin",
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: {
				glRenderer: "Metal Renderer",
			},
		},
		webgl: {
			renderer: "Metal Renderer",
		},
	});

	assert.equal(result.surfaceEligible, false);
	assert.equal(result.classification, "diagnostic");
	assert.deepEqual(result.ineligibilityReasons, [
		"page renderer is not Apple Metal / ANGLE Metal on the Darwin named host",
	]);
});

test("darwin Intel UHD without Metal is diagnostic on the Darwin Metal gate", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		platform: "darwin",
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: {
				glRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 770, OpenGL ES 3.2)",
			},
		},
		webgl: {
			renderer: "ANGLE (Intel, Intel(R) UHD Graphics 770)",
		},
	});

	assert.equal(result.surfaceEligible, false);
	assert.equal(result.classification, "diagnostic");
	assert.deepEqual(result.ineligibilityReasons, [
		"page renderer is not Apple Metal / ANGLE Metal on the Darwin named host",
	]);
});

test("linux still refuses Apple M1 Metal under the Omarchy RTX 4090 gate", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		platform: "linux",
		gpu: {
			featureStatus: {
				gpu_compositing: "enabled",
				rasterization: "enabled",
				webgl: "enabled",
			},
			auxAttributes: {
				glRenderer:
					"ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
			},
		},
		webgl: {
			renderer:
				"ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
		},
	});

	assert.equal(result.surfaceEligible, false);
	assert.equal(result.classification, "diagnostic");
	assert.deepEqual(result.ineligibilityReasons, [
		"page renderer is not the named NVIDIA GeForce RTX 4090 binding GPU",
	]);
});

test("an RTX auxiliary record cannot mask a different page renderer", () => {
	const result = classifyBrowserSurface({
		mode: "headed",
		instrumented: false,
		platform: "linux",
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
