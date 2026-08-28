/**
 * Force-directed frame-budget protocol. Compute-only: no document.
 *
 * The dated record is the item-3 decision. This suite checks the protocol
 * and that a representative network can tick without a DOM — it does not
 * re-time the 30 cool-down passes on every run.
 */
import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_MS,
  FORCE_BUDGET_RECORD,
  FORCE_NETWORK,
  FRAME_BUDGET_MS,
  createForceSimulation,
  paintPassStats,
  representativeNetwork,
} from "./force-budget";

describe("force-directed frame-budget protocol", () => {
  it("uses the same 16.7 ms / 60 fps bar as the Canvas week stack", () => {
    expect(FRAME_BUDGET_MS).toBe(16.7);
    expect(ACCEPTANCE_MS).toBe(17.7);
  });

  it("builds a deterministic hierarchy/network of the recorded density", () => {
    const network = representativeNetwork();
    const treeLinks = network.nodes.length - 1;
    const extraLinks = network.links.length - treeLinks;
    expect(network.nodes).toHaveLength(FORCE_BUDGET_RECORD.density.nodes);
    expect(network.links).toHaveLength(FORCE_BUDGET_RECORD.density.links);
    expect(treeLinks).toBe(FORCE_BUDGET_RECORD.density.treeLinks);
    expect(extraLinks).toBe(FORCE_BUDGET_RECORD.density.extraLinks);
    expect(FORCE_NETWORK.levels).toBe(5);
    expect(FORCE_NETWORK.branch).toBe(4);
  });

  it("ticks a simulation without a document", () => {
    const sim = createForceSimulation(representativeNetwork());
    sim.tick(3);
    const node = sim.nodes()[0];
    expect(node?.id).toBe("n0");
    expect(Number.isFinite(node?.x)).toBe(true);
    expect(Number.isFinite(node?.y)).toBe(true);
  });

  it("computes p95 from a sample list", () => {
    expect(paintPassStats([])).toEqual({ frames: 0, p50: 0, p95: 0, max: 0 });
    expect(paintPassStats([10, 12, 11, 40, 12])).toMatchObject({ frames: 5, max: 40 });
  });

  it("records an unbuilt outcome: protocol, hardware, range, density, p95", () => {
    const record = FORCE_BUDGET_RECORD;
    expect(record.protocol).toBe("hierarchy-force-frame-budget");
    expect(record.hardware.os.length).toBeGreaterThan(0);
    expect(record.hardware.cpu.length).toBeGreaterThan(0);
    expect(record.hardware.cores).toBeGreaterThan(0);
    expect(record.range.plot.width).toBe(FORCE_NETWORK.width);
    expect(record.density.nodes).toBeGreaterThan(0);
    expect(record.tick.p95Ms).toBeGreaterThanOrEqual(0);
    expect(record.coolDown.p95Ms).toBeGreaterThan(record.acceptanceMs);
    expect(record.coolDownBudgetBroke).toBe(true);
    expect(record.shipped).toBe(false);
  });
});
