/**
 * Browser-surface selection and evidence for the performance instruments.
 *
 * Frame measurement and attribution use the same browser-selection contract.
 * Keeping it here prevents a traced diagnostic from accidentally launching a
 * different Chrome surface than the measurement it is meant to explain.
 */
import { arg } from "./perf.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SURFACES = new Set(["headless", "headed"]);
const SOFTWARE_RENDERERS = new Map([
  ["swiftshader", "SwiftShader"],
  ["llvmpipe", "llvmpipe"],
  ["lavapipe", "lavapipe"],
]);

/** Frozen headed window geometry (protocol §1a). Omarchy keeps DP-2 origin. */
export const FROZEN_HEADED_WINDOW = Object.freeze({
	width: 1280,
	height: 1100,
	linuxPosition: Object.freeze({ x: 5440, y: 80 }),
	darwinPosition: Object.freeze({ x: 80, y: 80 }),
});

/** Omarchy headed soft-preflight workspace — silent pin; never focus-steal Adam's active WS. */
export const HEADED_HYPRLAND_WORKSPACE = 5;


/** Headed Chrome args: Omarchy floats on DP-2; Darwin stays on-screen with forced scale-factor 2. */
export function headedChromeArgs(platform = process.platform) {
	const { width, height, linuxPosition, darwinPosition } = FROZEN_HEADED_WINDOW;
	if (platform === "darwin") {
		return [
			`--window-position=${darwinPosition.x},${darwinPosition.y}`,
			`--window-size=${width},${height}`,
			// Forced launch pin (same class as --window-size): Mac binding gate
			// requires devicePixelRatio === 2 (§1a). 74432 recorded DPR 1 without
			// this; it is not a claim of authentic untouched host Retina.
			"--force-device-scale-factor=2",
			"--class=silkplot-perf",
		];
	}
	return [
		`--window-position=${linuxPosition.x},${linuxPosition.y}`,
		`--window-size=${width},${height}`,
		"--class=silkplot-perf",
	];
}

/** Pin the headed Darwin window to the frozen floating geometry via CDP. */
export async function pinDarwinFrozenWindow(
	page,
	{
		width = FROZEN_HEADED_WINDOW.width,
		height = FROZEN_HEADED_WINDOW.height,
		left = FROZEN_HEADED_WINDOW.darwinPosition.x,
		top = FROZEN_HEADED_WINDOW.darwinPosition.y,
	} = {},
) {
	const session = await page.context().newCDPSession(page);
	const { windowId } = await session.send("Browser.getWindowForTarget");
	await session.send("Browser.setWindowBounds", {
		windowId,
		bounds: { left, top, width, height, windowState: "normal" },
	});
}

/** Parse the public CLI surface and produce Playwright launch options. */
export function browserSurfacePlan(argv, { platform = process.platform } = {}) {
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
						args: headedChromeArgs(platform),
					}
				: {}),
    },
  };
}

const softwareRenderer = (text) => {
  const match = String(text ?? "").match(/swiftshader|llvmpipe|lavapipe|software rasterizer/i);
  if (!match) return undefined;
  const token = match[0].toLowerCase();
  return SOFTWARE_RENDERERS.get(token) ?? "software rasterizer";
};

/**
 * Record whether this browser has the named hardware rendering surface.
 * A route-specific observer decides whether headed/headless mode is eligible.
 */
export function classifyBrowserSurface({ instrumented, gpu = {}, webgl = {}, platform = process.platform }) {
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
  } else if (pageRenderer && platform === "darwin") {
    // Apple Metal / ANGLE Metal — Metal AND (Apple or ANGLE), not Apple-OR-Metal.
    const darwinNamedGpu =
      /Metal/i.test(pageRenderer) && /Apple|ANGLE/i.test(pageRenderer);
    if (!darwinNamedGpu) {
      ineligibilityReasons.push(
        "page renderer is not Apple Metal / ANGLE Metal on the Darwin named host",
      );
    }
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
export function selectCompositorClient(clients, browserPid, marker, { monitors } = {}) {
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
	const monitorId = client.monitor;
	return {
		observedAt: new Date().toISOString(),
		address: client.address ?? null,
		pid: client.pid,
		title: client.title ?? null,
		mapped: client.mapped,
		hidden: client.hidden,
		visible: client.visible,
		monitorId,
		monitorName: resolveMonitorName(monitors, monitorId),
		workspaceId: Number.isInteger(client?.workspace?.id)
			? client.workspace.id
			: null,
		position: { x, y },
		size: { width, height },
		xwayland: client.xwayland,
	};
}

/** Resolve Hyprland connector name from monitor id (named DP-2 gate evidence). */
export function resolveMonitorName(monitors, monitorId) {
	if (!Number.isInteger(monitorId)) return null;
	const match = (Array.isArray(monitors) ? monitors : []).find(
		(monitor) => monitor?.id === monitorId,
	);
	return typeof match?.name === "string" ? match.name : null;
}

/** Resolve Hyprland monitor id by connector name (DP-2 hard gate — never invent id 2). */
export function resolveNamedMonitorId(monitors, name = "DP-2") {
	const match = (Array.isArray(monitors) ? monitors : []).find(
		(monitor) => monitor?.name === name,
	);
	if (!Number.isInteger(match?.id)) {
		throw new Error(
			`headed evidence requires named monitor '${name}' from hyprctl monitors -j`,
		);
	}
	return match.id;
}

/**
 * Structured abort artifact so dig can recover hyprlandRetain without re-running.
 * Written to the existing --json path (workload.json) on headed pin / DP-2 hard fail.
 */
export function hyprlandRetainFailArtifact(retain, { reason, recordedBy } = {}) {
	return {
		recordedBy: recordedBy ?? "scripts/lib/browser-surface.mjs",
		abortedBeforeWorkloads: true,
		abortKind: "hyprland-pin-fail",
		abortReason: reason ?? null,
		hyprlandRetain: retain ?? null,
		results: [],
	};
}

/** Persist pin-fail retain into workload.json (+ sibling hyprland-retain.json) for dig. */
export function writeHyprlandRetainFailArtifact(jsonOutPath, retain, opts = {}) {
	if (!jsonOutPath || !retain) return null;
	const artifact = hyprlandRetainFailArtifact(retain, opts);
	writeFileSync(jsonOutPath, `${JSON.stringify(artifact, null, 2)}\n`);
	const retainPath = join(dirname(jsonOutPath), "hyprland-retain.json");
	writeFileSync(retainPath, `${JSON.stringify(retain, null, 2)}\n`);
	return { jsonOutPath, retainPath, artifact };
}

/** Longest stdout/stderr kept per hyprctl call in a retain record. */
export const HYPRCTL_OUTPUT_LIMIT = 8_192;

const clipOutput = (value) => {
	if (value === undefined || value === null) return null;
	const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
	return text.length > HYPRCTL_OUTPUT_LIMIT
		? `${text.slice(0, HYPRCTL_OUTPUT_LIMIT)}…[truncated ${text.length - HYPRCTL_OUTPUT_LIMIT} chars]`
		: text;
};

/**
 * Default hyprctl runner. Same contract as execFileSync (throws on a non-zero
 * exit, a signal or a timeout, with `status`/`signal`/`stdout`/`stderr` on the
 * error) except that a success returns `{ status, stdout, stderr }`, so a
 * successful dispatch's stderr is not lost. execFileSync cannot return it.
 */
export function spawnHyprctl(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		timeout: 2_000,
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
	if (result.error || result.status !== 0 || result.signal) {
		const error =
			result.error ??
			new Error(
				`${command} ${args[0] ?? ""} ${
					result.signal ? `killed by ${result.signal}` : `exited ${result.status}`
				}`,
			);
		error.status = result.status;
		error.signal = result.signal;
		error.stdout = result.stdout;
		error.stderr = result.stderr;
		throw error;
	}
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Run one hyprctl command and always leave an entry in `log`, success or not:
 * exit code, signal, timeout, stdout and stderr. Queries (`clients`, `monitors`)
 * keep only the stdout size on success; their payload is retained separately.
 * Returns the entry; rethrows the original error (with `hyprctlEntry` attached).
 *
 * `exec` may be execFileSync-shaped (returns stdout; stderr is then unavailable
 * on success and recorded as null) or spawnHyprctl-shaped.
 */
export function runHyprctl(exec, args, { step, log, keepStdout = true } = {}) {
	const entry = {
		step: step ?? args[0],
		command: "hyprctl",
		args,
		startedAt: new Date().toISOString(),
	};
	const opts = { encoding: "utf8", timeout: 2_000, stdio: ["ignore", "pipe", "pipe"] };
	try {
		const out = exec("hyprctl", args, opts);
		const shaped =
			out !== null && typeof out === "object" && !Buffer.isBuffer(out);
		const stdout = shaped ? out.stdout : out;
		const stdoutText = stdout === undefined || stdout === null ? "" : String(stdout);
		Object.assign(entry, {
			ok: true,
			exitCode: shaped && Number.isInteger(out.status) ? out.status : 0,
			signal: null,
			timedOut: false,
			stdout: keepStdout ? clipOutput(stdoutText) : null,
			stdoutBytes: Buffer.byteLength(stdoutText),
			stderr: shaped ? clipOutput(out.stderr) : null,
		});
		log?.push(entry);
		Object.defineProperty(entry, "raw", { value: stdoutText, enumerable: false });
		return entry;
	} catch (error) {
		Object.assign(entry, {
			ok: false,
			exitCode: Number.isInteger(error?.status) ? error.status : null,
			signal: error?.signal ?? null,
			timedOut: error?.code === "ETIMEDOUT",
			errorCode: error?.code ?? null,
			errorMessage: error?.message ?? String(error),
			stdout: clipOutput(error?.stdout),
			stderr: clipOutput(error?.stderr),
		});
		log?.push(entry);
		if (error !== null && typeof error === "object") {
			Object.defineProperty(error, "hyprctlEntry", {
				value: entry,
				enumerable: false,
				configurable: true,
				writable: true,
			});
		}
		throw error;
	}
}

const hyprctlJson = (execFile, args, { log, step } = {}) => {
	const entry = runHyprctl(execFile, args, { log, step, keepStdout: false });
	try {
		return JSON.parse(entry.raw);
	} catch (error) {
		entry.parseError = error?.message ?? String(error);
		entry.stdout = clipOutput(entry.raw);
		throw error;
	}
};

const hyprlandRetainSnapshot = (execFile, { log, label = "snapshot" } = {}) => ({
	monitors: hyprctlJson(execFile, ["monitors", "-j"], { log, step: `${label}:monitors` }),
	clients: hyprctlJson(execFile, ["clients", "-j"], { log, step: `${label}:clients` }),
});

const moveWindowToNamedMonitor = (dispatch, address, targetMonitorName, { log, step }) =>
	runHyprctl(
		dispatch,
		[
			"dispatch",
			`hl.dsp.window.move({ monitor = "${targetMonitorName}", follow = false, window = "address:${address}" })`,
		],
		{ log, step },
	);

/**
 * Pin the marked evidence window: named DP-2 (hard), then Hyprland WS5 (soft).
 *
 * Order matters. A monitor move lands the window on that monitor's *active*
 * workspace, so DP-2 goes first and WS5 second; the reverse order (or a DP-2
 * move after WS5) discards the workspace pin. Each move is issued at most once
 * here. There is no unconditional re-assert: if WS5 turns out to live on
 * another monitor, the caller observes that and repairs DP-2 once (see
 * pinnedCompositorClient), and the record says the pins were not both true on
 * the first try.
 *
 * Every dispatch's exit code, stdout and stderr go to `log` when given.
 * Returns false when the window was already on both pins (nothing issued).
 */
export function pinCompositorClient(
	client,
	{
		dispatch = spawnHyprctl,
		targetMonitorId,
		targetMonitorName = "DP-2",
		targetWorkspaceId = HEADED_HYPRLAND_WORKSPACE,
		log,
	} = {},
) {
	if (!/^0x[0-9a-f]+$/i.test(client?.address ?? "")) {
		throw new Error("headed display evidence requires a valid Hyprland address");
	}
	if (!Number.isInteger(targetMonitorId)) {
		throw new Error(
			"headed display evidence requires resolved targetMonitorId from named DP-2",
		);
	}
	const onMonitor = client?.monitorId === targetMonitorId;
	const onWorkspace = client?.workspaceId === targetWorkspaceId;
	if (onMonitor && onWorkspace) return false;
	if (!onMonitor) {
		moveWindowToNamedMonitor(dispatch, client.address, targetMonitorName, {
			log,
			step: "pin:monitor",
		});
	}
	// Needed after a monitor move even when the window reported WS5 before it:
	// that reading predates the move, which re-homes the window to DP-2's
	// active workspace.
	if (!onWorkspace || !onMonitor) {
		// Soft preflight (protocol 2026-09-28): a miss must not abort measure.
		// Hyprland 0.56+ Lua: classic movetoworkspacesilent is rejected;
		// hl.dsp.window.move({ workspace, silent = true }) creates WS5 if missing
		// and must not steal the user's focus. The failure is recorded in `log`.
		try {
			runHyprctl(
				dispatch,
				[
					"dispatch",
					`hl.dsp.window.move({ workspace = ${targetWorkspaceId}, silent = true, follow = false, window = "address:${client.address}" })`,
				],
				{ log, step: "pin:workspace" },
			);
		} catch {
			// Soft: the entry in `log` carries the exit code and output.
		}
	}
	return true;
}

/** Choose the headed compositor backend from the host platform. */
export function resolveCompositorBackend(platform = process.platform) {
	if (platform === "darwin") return "darwin-aqua";
	if (platform === "linux") return "hyprland";
	return "unsupported";
}

const compositorClient = async (
	page,
	browserPid,
	marker,
	{ execFile = spawnHyprctl, monitors, log } = {},
) => {
	let lastError;
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			const clients = hyprctlJson(execFile, ["clients", "-j"], {
				log,
				step: "observe:clients",
			});
			let monitorList = monitors;
			if (!Array.isArray(monitorList)) {
				try {
					monitorList = hyprctlJson(execFile, ["monitors", "-j"], {
						log,
						step: "observe:monitors",
					});
				} catch {
					monitorList = undefined;
				}
			}
			return selectCompositorClient(clients, browserPid, marker, {
				monitors: monitorList,
			});
		} catch (error) {
			lastError = error;
			await page.waitForTimeout(50);
		}
	}
	throw lastError;
};

const attachHyprlandRetain = (target, retain) => {
	Object.defineProperty(target, "hyprlandRetain", {
		value: retain,
		enumerable: true,
		configurable: true,
		writable: true,
	});
	return target;
};

/** Plain-data description of a thrown value for the retain record. */
const describeFailure = (stage, error) => ({
	stage,
	message: error instanceof Error ? error.message : String(error),
	code: error?.code ?? null,
	exitCode: Number.isInteger(error?.status) ? error.status : null,
	signal: error?.signal ?? null,
	timedOut: error?.code === "ETIMEDOUT",
});

const pinnedCompositorClient = async (
	page,
	browserPid,
	marker,
	{
		execFile = spawnHyprctl,
		targetMonitorName = "DP-2",
	} = {},
) => {
	// Every hyprctl call below appends here (exit code, stdout, stderr), and
	// every exit path — success or throw — carries it in `hyprlandRetain`.
	const log = [];
	const state = {
		before: null,
		after: null,
		targetMonitorId: null,
		pin: { firstTryBothPins: null, dp2Repairs: 0 },
	};
	const retainRecord = (extra = {}) => ({
		before: state.before,
		after: state.after ?? state.before,
		targetMonitorName,
		targetMonitorId: state.targetMonitorId,
		pin: { ...state.pin },
		dispatches: log,
		...extra,
	});
	const bestEffortAfter = () => {
		try {
			return hyprlandRetainSnapshot(execFile, { log, label: "after" });
		} catch {
			return state.before;
		}
	};
	// Any throw leaves a record: before/after snapshots when they exist, the
	// full command log, and which stage failed.
	const failed = (stage, error, { snapshotAfter = true } = {}) => {
		const failure = error instanceof Error ? error : new Error(String(error));
		if (failure.hyprlandRetain) return failure;
		if (snapshotAfter && state.before) state.after = bestEffortAfter();
		return attachHyprlandRetain(
			failure,
			retainRecord({ failure: describeFailure(stage, failure) }),
		);
	};

	// Retain raw Hyprland clients+monitors before the pin sequence so dig is
	// never ABSENT on DP-2 hard fail (host-2624233).
	try {
		state.before = hyprlandRetainSnapshot(execFile, { log, label: "before" });
	} catch (error) {
		const fail = new Error(
			`headed evidence could not retain Hyprland clients/monitors before pin: ${error?.message ?? error}`,
		);
		fail.cause = error;
		fail.status = error?.status;
		fail.signal = error?.signal;
		fail.code = error?.code;
		throw failed("retain-before", fail, { snapshotAfter: false });
	}
	try {
		state.targetMonitorId = resolveNamedMonitorId(
			state.before.monitors,
			targetMonitorName,
		);
	} catch (error) {
		throw failed("resolve-named-monitor", error, { snapshotAfter: false });
	}
	const targetMonitorId = state.targetMonitorId;
	const finish = (result) => {
		state.after = bestEffortAfter();
		return attachHyprlandRetain(result, retainRecord());
	};
	const observe = () =>
		compositorClient(page, browserPid, marker, {
			execFile,
			monitors: state.before.monitors,
			log,
		});
	// Poll until the window is on named DP-2 and WS5, or the attempts run out.
	const settle = async () => {
		let last;
		let onNamedOutput = false;
		for (let attempt = 0; attempt < 20; attempt++) {
			await page.waitForTimeout(50);
			last = await observe();
			if (last.monitorId === targetMonitorId) {
				onNamedOutput = true;
				// Prefer WS5 when the soft pin lands, but named DP-2 alone is enough.
				if (last.workspaceId === HEADED_HYPRLAND_WORKSPACE) break;
			}
		}
		return { last, onNamedOutput };
	};

	let stage = "client-lookup";
	try {
		const client = await observe();
		stage = "pin-dispatch";
		if (!pinCompositorClient(client, { dispatch: execFile, targetMonitorId, targetMonitorName, log })) {
			state.pin.firstTryBothPins = true;
			return finish(client);
		}

		stage = "pin-observe";
		let { last: moved, onNamedOutput } = await settle();
		state.pin.firstTryBothPins =
			onNamedOutput && moved.workspaceId === HEADED_HYPRLAND_WORKSPACE;
		if (!onNamedOutput) {
			// The soft WS5 move re-homed the window to another monitor (WS5 is not
			// on DP-2). Repair the DP-2 hard gate once, observably, and say so.
			stage = "dp2-repair";
			state.pin.dp2Repairs = 1;
			moveWindowToNamedMonitor(execFile, client.address, targetMonitorName, {
				log,
				step: "repair:monitor",
			});
			stage = "pin-observe-after-repair";
			({ last: moved, onNamedOutput } = await settle());
		}
		if (!onNamedOutput || moved.monitorId !== targetMonitorId) {
			throw new Error(
				`headed evidence window '${client.address}' did not pin to named ${targetMonitorName} output (id ${targetMonitorId})`,
			);
		}
		return finish(moved);
	} catch (error) {
		throw failed(stage, error);
	}
};

/** Soft-preflight record for Hyprland WS5 silent pin (not a binding / §6 gate). */
export function workspace5SilentPinRecord(before, after) {
	const beforeId = before?.workspaceId;
	const afterId = after?.workspaceId;
	return {
		softPreflight: true,
		attempted: true,
		succeeded:
			beforeId === HEADED_HYPRLAND_WORKSPACE &&
			afterId === HEADED_HYPRLAND_WORKSPACE,
		targetWorkspaceId: HEADED_HYPRLAND_WORKSPACE,
		beforeWorkspaceId: beforeId ?? null,
		afterWorkspaceId: afterId ?? null,
	};
}

/** Carry the pin-time retain, plus any later hyprctl calls, on a post-pin failure. */
const withAfterMeasureRetain = (error, compositorBefore, laterLog, stage) => {
	const failure = error instanceof Error ? error : new Error(String(error));
	const base = compositorBefore?.hyprlandRetain;
	if (!base || failure.hyprlandRetain) return failure;
	return attachHyprlandRetain(failure, {
		...base,
		dispatches: [...(base.dispatches ?? []), ...laterLog],
		failure: describeFailure(stage, failure),
	});
};

/** Measure the output and steady-state rAF cadence of the actual headed page. */
export async function inspectDisplaySurface(
	page,
	sampleCount = 120,
	context = "unspecified",
	{
		mode = "headless",
		browserPid = null,
		platform = process.platform,
		compositorBackend = resolveCompositorBackend(platform),
		execFile = spawnHyprctl,
		pinFrozenWindow = pinDarwinFrozenWindow,
	} = {},
) {
	let originalTitle;
	let marker;
	let compositorBefore;
	const useHyprland = mode === "headed" && compositorBackend === "hyprland";
	const useDarwinAqua = mode === "headed" && compositorBackend === "darwin-aqua";
	if (mode === "headed") {
		if (!Number.isInteger(browserPid) || browserPid <= 0) {
			throw new Error("headed display evidence requires the CDP browser PID");
		}
		originalTitle = await page.title();
		marker = `silkplot-evidence-${context}-${browserPid}-${Date.now()}`;
		await page.evaluate((title) => {
			document.title = title;
		}, marker);
		if (useHyprland) {
			compositorBefore = await pinnedCompositorClient(page, browserPid, marker, {
				execFile,
			});
		} else if (useDarwinAqua) {
			// 74432: Omarchy --window-position=5440,80 clamped off-laptop; pin on-screen.
			await pinFrozenWindow(page);
			const pinned = await page.evaluate(() => ({
				outerWidth,
				outerHeight,
				screenX,
				screenY,
				devicePixelRatio,
			}));
			if (
				pinned.outerWidth !== FROZEN_HEADED_WINDOW.width ||
				pinned.outerHeight !== FROZEN_HEADED_WINDOW.height
			) {
				throw new Error(
					`headed Darwin evidence window is ${pinned.outerWidth}x${pinned.outerHeight}, not frozen floating ${FROZEN_HEADED_WINDOW.width}x${FROZEN_HEADED_WINDOW.height}`,
				);
			}
			compositorBefore = {
				observedAt: new Date().toISOString(),
				pid: browserPid,
				title: marker,
				position: { x: pinned.screenX, y: pinned.screenY },
				size: { width: pinned.outerWidth, height: pinned.outerHeight },
				devicePixelRatio: pinned.devicePixelRatio,
			};
		}
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
		if (mode !== "headed") {
			return {
				context,
				...reading,
			};
		}
		if (useHyprland) {
			const afterLog = [];
			let compositorAfter;
			try {
				compositorAfter = await compositorClient(page, browserPid, marker, {
					execFile,
					log: afterLog,
				});
			} catch (error) {
				throw withAfterMeasureRetain(
					error,
					compositorBefore,
					afterLog,
					"compositor-after",
				);
			}
			return {
				context,
				...reading,
				compositor: {
					marker,
					before: compositorBefore,
					after: compositorAfter,
					workspace5SilentPin: workspace5SilentPinRecord(
						compositorBefore,
						compositorAfter,
					),
				},
			};
		}
		// Darwin Aqua: record compositor before/after sizes from the pinned
		// floating window so windowGeometryFrozen can pass without Hyprland.
		if (useDarwinAqua) {
			const after = reading.screen;
			if (
				after.outerWidth !== FROZEN_HEADED_WINDOW.width ||
				after.outerHeight !== FROZEN_HEADED_WINDOW.height
			) {
				throw new Error(
					`headed Darwin evidence window drifted to ${after.outerWidth}x${after.outerHeight}, not frozen floating ${FROZEN_HEADED_WINDOW.width}x${FROZEN_HEADED_WINDOW.height}`,
				);
			}
			return {
				context,
				...reading,
				compositor: {
					marker,
					backend: compositorBackend,
					before: compositorBefore,
					after: {
						observedAt: reading.endedAt,
						pid: browserPid,
						title: marker,
						position: { x: after.screenX, y: after.screenY },
						size: { width: after.outerWidth, height: after.outerHeight },
						devicePixelRatio: after.devicePixelRatio,
					},
				},
			};
		}
		// Other non-Hyprland headed hosts: keep screen + rAF; no binding claim.
		return {
			context,
			...reading,
			compositor: {
				marker,
				backend: compositorBackend,
				hyprlandSkipped: true,
			},
		};
	} catch (error) {
		// A failure after the pin (measurement, or the after-reading) still leaves
		// the pin-time retain on the error so the caller can persist it.
		if (useHyprland && !error?.hyprlandRetain) {
			throw withAfterMeasureRetain(error, compositorBefore, [], "measure");
		}
		throw error;
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
    platform: process.platform,
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
