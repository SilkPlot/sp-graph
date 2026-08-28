/**
 * Force-directed frame-budget protocol.
 *
 * Force is a signed backlog type (not a Plotly row). This module builds a
 * representative hierarchy/network and times d3-force ticks against ADR-0002's
 * 16.7 ms / 60 fps bar. It is compute-only: no document, no chart.
 *
 * The dated record is the decision. A live re-run can move by milliseconds;
 * it does not rewrite the recorded outcome.
 */
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

function nowMs(): number {
  return (globalThis as unknown as { performance: { now: () => number } }).performance.now();
}

export const FRAME_BUDGET_MS = 16.7;
export const TIMER_TOLERANCE_MS = 1.0;
export const ACCEPTANCE_MS = FRAME_BUDGET_MS + TIMER_TOLERANCE_MS;

export const FORCE_NETWORK = {
  levels: 5,
  branch: 4,
  extraLinkEvery: 10,
  extraTargetOffset: 7,
  width: 800,
  height: 600,
  linkDistance: 24,
  charge: -40,
  collideRadius: 8,
  coolTicks: 300,
  warmupPasses: 5,
  timedPasses: 30,
} as const;

export interface ForceNode extends SimulationNodeDatum {
  id: string;
}

export interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
}

export interface ForceNetwork {
  nodes: ForceNode[];
  links: ForceLink[];
}

/** Deterministic 5-level branching-4 org, plus sparse cross edges. */
export function representativeNetwork(
  levels = FORCE_NETWORK.levels,
  branch = FORCE_NETWORK.branch,
): ForceNetwork {
  const nodes: ForceNode[] = [{ id: "n0" }];
  const links: ForceLink[] = [];
  let generationStart = 0;
  let generationCount = 1;
  for (let level = 1; level < levels; level += 1) {
    let added = 0;
    for (let parent = 0; parent < generationCount; parent += 1) {
      const parentId = nodes[generationStart + parent]!.id;
      for (let child = 0; child < branch; child += 1) {
        const id = `n${nodes.length}`;
        nodes.push({ id });
        links.push({ source: parentId, target: id });
        added += 1;
      }
    }
    generationStart += generationCount;
    generationCount = added;
  }
  for (let i = 0; i < nodes.length; i += FORCE_NETWORK.extraLinkEvery) {
    const j = (i + FORCE_NETWORK.extraTargetOffset) % nodes.length;
    if (j !== i) links.push({ source: nodes[i]!.id, target: nodes[j]!.id });
  }
  return { nodes, links };
}

export function createForceSimulation(
  network: ForceNetwork,
  width = FORCE_NETWORK.width,
  height = FORCE_NETWORK.height,
): Simulation<ForceNode, ForceLink> {
  const nodes = network.nodes.map((node) => ({ ...node }));
  const links = network.links.map((link) => ({ ...link }));
  return forceSimulation(nodes)
    .force(
      "link",
      forceLink<ForceNode, ForceLink>(links)
        .id((d) => d.id)
        .distance(FORCE_NETWORK.linkDistance),
    )
    .force("charge", forceManyBody().strength(FORCE_NETWORK.charge))
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(FORCE_NETWORK.collideRadius))
    .stop();
}

export interface PaintPassStats {
  frames: number;
  p50: number;
  p95: number;
  max: number;
}

export function paintPassStats(samples: readonly number[]): PaintPassStats {
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 0) return { frames: 0, p50: 0, p95: 0, max: 0 };
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  return {
    frames: sorted.length,
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +sorted[sorted.length - 1]!.toFixed(2),
  };
}

export function timeTicks(
  sim: Simulation<ForceNode, ForceLink>,
  warmup = FORCE_NETWORK.warmupPasses,
  timed = FORCE_NETWORK.timedPasses,
): number[] {
  for (let i = 0; i < warmup; i += 1) sim.tick();
  const samples: number[] = [];
  for (let i = 0; i < timed; i += 1) {
    const t0 = nowMs();
    sim.tick();
    samples.push(nowMs() - t0);
  }
  return samples;
}

export function timeCoolDown(
  network: ForceNetwork,
  ticks = FORCE_NETWORK.coolTicks,
  warmup = FORCE_NETWORK.warmupPasses,
  timed = FORCE_NETWORK.timedPasses,
): number[] {
  for (let i = 0; i < warmup; i += 1) createForceSimulation(network).tick(ticks);
  const samples: number[] = [];
  for (let i = 0; i < timed; i += 1) {
    const sim = createForceSimulation(network);
    const t0 = nowMs();
    sim.tick(ticks);
    samples.push(nowMs() - t0);
  }
  return samples;
}

export interface ForceBudgetRecord {
  protocol: "hierarchy-force-frame-budget";
  measuredAt: string;
  hardware: {
    os: string;
    cpu: string;
    cores: number;
    ramGiB: number;
    runtime: string;
  };
  range: {
    plot: { width: number; height: number };
    coolTicks: number;
  };
  density: {
    levels: number;
    branch: number;
    nodes: number;
    treeLinks: number;
    extraLinks: number;
    links: number;
  };
  tick: { passes: number; p50Ms: number; p95Ms: number; maxMs: number };
  coolDown: { passes: number; ticks: number; p50Ms: number; p95Ms: number; maxMs: number };
  budgetMs: number;
  acceptanceMs: number;
  tickBudgetBroke: boolean;
  coolDownBudgetBroke: boolean;
  shipped: boolean;
}

/**
 * Filled from the Node measurement on this branch's hardware. The numbers
 * are a dated measurement, not a live CI gate. `shipped` is the item-3
 * decision: implement force on Canvas only if the sync cool-down holds the
 * interaction budget. It did not.
 */
export const FORCE_BUDGET_RECORD: ForceBudgetRecord = {
  protocol: "hierarchy-force-frame-budget",
  measuredAt: "2026-08-28",
  hardware: {
    os: "Linux 6.12.94 x86_64 (KVM)",
    cpu: "Intel Xeon Processor @ 2400 MHz",
    cores: 4,
    ramGiB: 15,
    runtime: "Node.js v24.20.0 (d3-force 3.0.0, no document)",
  },
  range: {
    plot: { width: FORCE_NETWORK.width, height: FORCE_NETWORK.height },
    coolTicks: FORCE_NETWORK.coolTicks,
  },
  density: {
    levels: FORCE_NETWORK.levels,
    branch: FORCE_NETWORK.branch,
    nodes: 341,
    treeLinks: 340,
    extraLinks: 35,
    links: 375,
  },
  tick: { passes: FORCE_NETWORK.timedPasses, p50Ms: 1.24, p95Ms: 2.02, maxMs: 2.1 },
  coolDown: {
    passes: FORCE_NETWORK.timedPasses,
    ticks: FORCE_NETWORK.coolTicks,
    p50Ms: 260.54,
    p95Ms: 288.46,
    maxMs: 323.01,
  },
  budgetMs: FRAME_BUDGET_MS,
  acceptanceMs: ACCEPTANCE_MS,
  tickBudgetBroke: false,
  coolDownBudgetBroke: true,
  shipped: false,
};

export function measureForceBudget(): {
  network: ForceNetwork;
  tick: PaintPassStats;
  coolDown: PaintPassStats;
} {
  const network = representativeNetwork();
  return {
    network,
    tick: paintPassStats(timeTicks(createForceSimulation(network))),
    coolDown: paintPassStats(timeCoolDown(network)),
  };
}

