import assert from "node:assert/strict";
import test from "node:test";
import {
	appendBrowserProcessSnapshot,
  browserSurfacePlan,
  classifyBrowserSurface,
	FROZEN_HEADED_WINDOW,
	headedChromeArgs,
  inspectBrowserSurface,
	inspectDisplaySurface,
	pinCompositorClient,
	HEADED_HYPRLAND_WORKSPACE,
	resolveCompositorBackend,
	resolveNamedMonitorId,
	selectCompositorClient,
	workspace5SilentPinRecord,
} from "./browser-surface.mjs";

const MOCK_MONITORS = [
	{ id: 0, name: "HDMI-A-1" },
	{ id: 1, name: "DP-1" },
	{ id: 2, name: "DP-2" },
];

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

test("resolveNamedMonitorId gates DP-2 by connector name not a hardcoded id", () => {
	assert.equal(resolveNamedMonitorId(MOCK_MONITORS, "DP-2"), 2);
	assert.equal(
		resolveNamedMonitorId([{ id: 7, name: "DP-2" }, { id: 2, name: "HDMI-A-1" }], "DP-2"),
		7,
	);
	assert.throws(
		() => resolveNamedMonitorId([{ id: 2, name: "HDMI-A-1" }], "DP-2"),
		/named monitor 'DP-2'/,
	);
});

test("a headed evidence window is pinned to DP-2 and Hyprland WS5 without focus-steal", () => {
	const calls = [];
	const dispatch = (...args) => calls.push(args);
	const opts = {
		encoding: "utf8",
		timeout: 2_000,
		stdio: ["ignore", "pipe", "pipe"],
	};
	const dp2Move = [
		"hyprctl",
		[
			"dispatch",
			'hl.dsp.window.move({ monitor = "DP-2", follow = false, window = "address:0xabc123" })',
		],
		opts,
	];
	const ws5Move = [
		"hyprctl",
		[
			"dispatch",
			`hl.dsp.window.move({ workspace = ${HEADED_HYPRLAND_WORKSPACE}, silent = true, follow = false, window = "address:0xabc123" })`,
		],
		opts,
	];
	assert.equal(
		pinCompositorClient(
			{ address: "0xabc123", monitorId: 1, workspaceId: 4 },
			{ dispatch, targetMonitorId: 2 },
		),
		true,
	);
	// Initial DP-2 move, soft WS5, then always re-assert DP-2 by name.
	assert.deepEqual(calls, [dp2Move, ws5Move, dp2Move]);

	calls.length = 0;
	assert.equal(
		pinCompositorClient(
			{ address: "0xabc123", monitorId: 2, workspaceId: 4 },
			{ dispatch, targetMonitorId: 2 },
		),
		true,
	);
	assert.deepEqual(calls, [ws5Move, dp2Move]);

	calls.length = 0;
	assert.equal(
		pinCompositorClient(
			{
				address: "0xabc123",
				monitorId: 2,
				workspaceId: HEADED_HYPRLAND_WORKSPACE,
			},
			{ dispatch, targetMonitorId: 2 },
		),
		false,
	);
	assert.deepEqual(calls, []);
	assert.throws(
		() => pinCompositorClient({ address: "not-an-address", monitorId: 1 }),
		/valid Hyprland address/,
	);
	assert.throws(
		() =>
			pinCompositorClient(
				{ address: "0xabc123", monitorId: 1, workspaceId: 4 },
				{ dispatch },
			),
		/resolved targetMonitorId/,
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
		outerHeight: 1100,
		innerWidth: 1200,
		innerHeight: 900,
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
		width: FROZEN_HEADED_WINDOW.width,
		height: FROZEN_HEADED_WINDOW.height,
	});
	assert.deepEqual(reading.compositor.after.size, {
		width: FROZEN_HEADED_WINDOW.width,
		height: FROZEN_HEADED_WINDOW.height,
	});
	assert.match(reading.compositor.marker, /^silkplot-evidence-probe-darwin-14447-/);
	assert.deepEqual(reading.rafDeltas, [16.6, 16.7, 16.5]);
	assert.equal(title, "original");

});

test("linux headed display inspect pins DP-2 and silent-moves to WS5", async () => {
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
		workspace: { id: 4, name: "4" },
		at: [100, 80],
		size: [1280, 1100],
		xwayland: false,
	};
	const clientPinned = {
		...clientOnOne,
		monitor: 2,
		workspace: { id: HEADED_HYPRLAND_WORKSPACE, name: String(HEADED_HYPRLAND_WORKSPACE) },
		at: [5440, 80],
	};
	let pinned = false;

	const page = {
		title: async () => title,
		waitForTimeout: async () => {},
		evaluate: async (callback, argument) => {
			if (typeof callback === "function" && callback.length === 1 && typeof argument === "string") {
				title = argument;
				clientOnOne.title = argument;
				clientPinned.title = argument;
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
		if (args[0] === "monitors") {
			return JSON.stringify(MOCK_MONITORS);
		}
		if (args[0] === "clients") {
			return JSON.stringify([pinned ? clientPinned : clientOnOne]);
		}
		if (args[0] === "dispatch") {
			const dispatchArg = args[1] ?? "";
			if (dispatchArg.includes("hl.dsp.window.move")) {
				pinned = true;
			}
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
	assert.ok(calls.some(([command, args]) => command === "hyprctl" && args[0] === "monitors"));
	const dispatches = calls.filter(([command, args]) => command === "hyprctl" && args[0] === "dispatch");
	assert.equal(dispatches.length, 3);
	assert.equal(
		dispatches[0][1][1],
		'hl.dsp.window.move({ monitor = "DP-2", follow = false, window = "address:0xabc123" })',
	);
	assert.equal(
		dispatches[1][1][1],
		`hl.dsp.window.move({ workspace = ${HEADED_HYPRLAND_WORKSPACE}, silent = true, follow = false, window = "address:0xabc123" })`,
	);
	assert.equal(
		dispatches[2][1][1],
		'hl.dsp.window.move({ monitor = "DP-2", follow = false, window = "address:0xabc123" })',
	);
	assert.equal(reading.compositor.before.hyprlandRetain.targetMonitorId, 2);
	assert.equal(reading.compositor.before.hyprlandRetain.targetMonitorName, "DP-2");
	assert.ok(Array.isArray(reading.compositor.before.hyprlandRetain.before.monitors));
	assert.ok(Array.isArray(reading.compositor.before.hyprlandRetain.after.clients));
	assert.equal(reading.compositor.before.monitorId, 2);
	assert.equal(reading.compositor.before.workspaceId, HEADED_HYPRLAND_WORKSPACE);
	assert.equal(reading.compositor.after.monitorId, 2);
	assert.equal(reading.compositor.after.workspaceId, HEADED_HYPRLAND_WORKSPACE);
	assert.equal(reading.compositor.before.address, "0xabc123");
	assert.equal(reading.compositor.backend, undefined);
	assert.equal(reading.compositor.hyprlandSkipped, undefined);
	assert.deepEqual(reading.compositor.workspace5SilentPin, {
		softPreflight: true,
		attempted: true,
		succeeded: true,
		targetWorkspaceId: HEADED_HYPRLAND_WORKSPACE,
		beforeWorkspaceId: HEADED_HYPRLAND_WORKSPACE,
		afterWorkspaceId: HEADED_HYPRLAND_WORKSPACE,
	});
	assert.deepEqual(reading.rafDeltas, [16.67, 16.67]);
	assert.equal(title, "original");
});

test("linux headed display inspect keeps measuring when WS5 soft pin misses on DP-2", async () => {
	const calls = [];
	let title = "original";
	const clientOnOne = {
		pid: 42,
		title: "silkplot-evidence-probe-linux-ws5-miss",
		address: "0xdef456",
		mapped: true,
		hidden: false,
		visible: true,
		monitor: 1,
		workspace: { id: 4, name: "4" },
		at: [100, 80],
		size: [1280, 1100],
		xwayland: false,
	};
	const clientOnDp2 = {
		...clientOnOne,
		monitor: 2,
		workspace: { id: 4, name: "4" },
		at: [5440, 80],
	};
	let onDp2 = false;

	const page = {
		title: async () => title,
		waitForTimeout: async () => {},
		evaluate: async (callback, argument) => {
			if (typeof callback === "function" && callback.length === 1 && typeof argument === "string") {
				title = argument;
				clientOnOne.title = argument;
				clientOnDp2.title = argument;
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
		if (args[0] === "monitors") {
			return JSON.stringify(MOCK_MONITORS);
		}
		if (args[0] === "clients") {
			return JSON.stringify([onDp2 ? clientOnDp2 : clientOnOne]);
		}
		if (args[0] === "dispatch") {
			const dispatchArg = args[1] ?? "";
			if (dispatchArg.includes('monitor = "DP-2"')) {
				onDp2 = true;
				return "";
			}
			if (dispatchArg.includes("workspace =")) {
				// Soft miss: silent WS5 pin is rejected / no-ops; stay on WS4.
				throw new Error("soft WS5 pin rejected");
			}
			throw new Error(`unexpected hyprctl dispatch: ${dispatchArg}`);
		}
		throw new Error(`unexpected hyprctl args: ${JSON.stringify(args)}`);
	};

	const reading = await inspectDisplaySurface(page, 2, "probe-linux-ws5-miss", {
		mode: "headed",
		browserPid: 42,
		platform: "linux",
		execFile,
	});

	assert.equal(reading.compositor.before.monitorId, 2);
	assert.equal(reading.compositor.before.workspaceId, 4);
	assert.equal(reading.compositor.after.monitorId, 2);
	assert.equal(reading.compositor.after.workspaceId, 4);
	assert.deepEqual(reading.compositor.workspace5SilentPin, {
		softPreflight: true,
		attempted: true,
		succeeded: false,
		targetWorkspaceId: HEADED_HYPRLAND_WORKSPACE,
		beforeWorkspaceId: 4,
		afterWorkspaceId: 4,
	});
	assert.deepEqual(
		workspace5SilentPinRecord(reading.compositor.before, reading.compositor.after),
		reading.compositor.workspace5SilentPin,
	);
	assert.deepEqual(reading.rafDeltas, [16.67, 16.67]);
	assert.equal(title, "original");
	assert.ok(
		calls.some(
			([, args]) =>
				args[0] === "dispatch" &&
				String(args[1]).includes(`workspace = ${HEADED_HYPRLAND_WORKSPACE}`),
		),
	);
	const missDispatches = calls.filter(([, args]) => args[0] === "dispatch");
	assert.equal(missDispatches.length, 3);
	assert.match(String(missDispatches[0][1][1]), /monitor = "DP-2"/);
	assert.match(String(missDispatches[1][1][1]), /workspace = 5/);
	assert.match(String(missDispatches[2][1][1]), /monitor = "DP-2"/);
	assert.equal(reading.compositor.before.hyprlandRetain.targetMonitorId, 2);
});



test("linux headed display inspect fails hard when named DP-2 is absent and retains clients", async () => {
	const calls = [];
	let title = "original";
	const client = {
		pid: 42,
		title: "silkplot-evidence-probe-linux-absent",
		address: "0xdead01",
		mapped: true,
		hidden: false,
		visible: true,
		monitor: 1,
		workspace: { id: 4, name: "4" },
		at: [100, 80],
		size: [1280, 1100],
		xwayland: false,
	};
	const page = {
		title: async () => title,
		waitForTimeout: async () => {},
		evaluate: async (callback, argument) => {
			if (typeof callback === "function" && callback.length === 1 && typeof argument === "string") {
				title = argument;
				client.title = argument;
				return undefined;
			}
			throw new Error("measure must not run when DP-2 is absent");
		},
	};
	const execFile = (command, args, options) => {
		calls.push([command, args, options]);
		assert.equal(command, "hyprctl");
		if (args[0] === "monitors") {
			return JSON.stringify([{ id: 0, name: "HDMI-A-1" }, { id: 1, name: "DP-1" }]);
		}
		if (args[0] === "clients") {
			return JSON.stringify([client]);
		}
		throw new Error(`unexpected hyprctl args: ${JSON.stringify(args)}`);
	};
	await assert.rejects(
		() =>
			inspectDisplaySurface(page, 2, "probe-linux-absent", {
				mode: "headed",
				browserPid: 42,
				platform: "linux",
				execFile,
			}),
		(error) => {
			assert.match(String(error?.message ?? error), /named monitor 'DP-2'/);
			return true;
		},
	);
	assert.ok(calls.some(([, args]) => args[0] === "monitors"));
});

test("linux headed display inspect resolves DP-2 by name when its id is not 2", async () => {
	const calls = [];
	let title = "original";
	const monitors = [
		{ id: 0, name: "HDMI-A-1" },
		{ id: 7, name: "DP-2" },
	];
	const clientOnOne = {
		pid: 42,
		title: "silkplot-evidence-probe-linux-id7",
		address: "0x1d70001",
		mapped: true,
		hidden: false,
		visible: true,
		monitor: 0,
		workspace: { id: 4, name: "4" },
		at: [100, 80],
		size: [1280, 1100],
		xwayland: false,
	};
	const clientPinned = {
		...clientOnOne,
		monitor: 7,
		workspace: { id: HEADED_HYPRLAND_WORKSPACE, name: String(HEADED_HYPRLAND_WORKSPACE) },
		at: [5440, 80],
	};
	let pinned = false;
	const page = {
		title: async () => title,
		waitForTimeout: async () => {},
		evaluate: async (callback, argument) => {
			if (typeof callback === "function" && callback.length === 1 && typeof argument === "string") {
				title = argument;
				clientOnOne.title = argument;
				clientPinned.title = argument;
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
	const execFile = (command, args) => {
		calls.push([command, args]);
		assert.equal(command, "hyprctl");
		if (args[0] === "monitors") return JSON.stringify(monitors);
		if (args[0] === "clients") {
			return JSON.stringify([pinned ? clientPinned : clientOnOne]);
		}
		if (args[0] === "dispatch") {
			pinned = true;
			return "";
		}
		throw new Error(`unexpected hyprctl args: ${JSON.stringify(args)}`);
	};
	const reading = await inspectDisplaySurface(page, 2, "probe-linux-id7", {
		mode: "headed",
		browserPid: 42,
		platform: "linux",
		execFile,
	});
	assert.equal(reading.compositor.before.monitorId, 7);
	assert.equal(reading.compositor.before.hyprlandRetain.targetMonitorId, 7);
	assert.equal(reading.compositor.after.monitorId, 7);
	assert.ok(!calls.some(([, args]) => args[0] === "dispatch" && String(args).includes("monitorId")));
});

test("linux headed display inspect retains clients on DP-2 hard fail after soft WS5 yank", async () => {
	const calls = [];
	let title = "original";
	const clientOnOne = {
		pid: 42,
		title: "silkplot-evidence-probe-linux-yank",
		address: "0x0a70101",
		mapped: true,
		hidden: false,
		visible: true,
		monitor: 1,
		workspace: { id: 3, name: "3" },
		at: [100, 80],
		size: [1280, 1100],
		xwayland: false,
	};
	// After soft WS5 the host rule yanks the window onto HDMI (monitor 0) — DP-2 hard fail.
	const clientYanked = {
		...clientOnOne,
		monitor: 0,
		workspace: { id: 3, name: "3" },
	};
	let phase = "before";
	const page = {
		title: async () => title,
		waitForTimeout: async () => {},
		evaluate: async (callback, argument) => {
			if (typeof callback === "function" && callback.length === 1 && typeof argument === "string") {
				title = argument;
				clientOnOne.title = argument;
				clientYanked.title = argument;
				return undefined;
			}
			throw new Error("measure must not run on DP-2 hard fail");
		},
	};
	const execFile = (command, args) => {
		calls.push([command, args]);
		assert.equal(command, "hyprctl");
		if (args[0] === "monitors") return JSON.stringify(MOCK_MONITORS);
		if (args[0] === "clients") {
			return JSON.stringify([phase === "before" ? clientOnOne : clientYanked]);
		}
		if (args[0] === "dispatch") {
			phase = "after";
			return "";
		}
		throw new Error(`unexpected hyprctl args: ${JSON.stringify(args)}`);
	};
	await assert.rejects(
		() =>
			inspectDisplaySurface(page, 2, "probe-linux-yank", {
				mode: "headed",
				browserPid: 42,
				platform: "linux",
				execFile,
			}),
		(error) => {
			assert.match(String(error?.message ?? error), /named DP-2 output \(id 2\)/);
			assert.ok(error.hyprlandRetain);
			assert.equal(error.hyprlandRetain.targetMonitorId, 2);
			assert.ok(Array.isArray(error.hyprlandRetain.before.clients));
			assert.ok(Array.isArray(error.hyprlandRetain.after.clients));
			assert.equal(error.hyprlandRetain.after.clients[0].monitor, 0);
			return true;
		},
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
      "--window-size=1280,1100",
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
