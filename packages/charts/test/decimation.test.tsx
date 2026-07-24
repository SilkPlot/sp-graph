/**
 * The ADR-0023 decimation contract, proven on the rendered chart.
 *
 * `core`'s suite proves the algorithm equals the measured candidate; this file
 * proves the CHART honours the contract around it — the split the ADR names:
 * the path is the envelope, the active point is the truth.
 *
 *   - the budget bounds what is PAINTED, and the envelope survives (the global
 *     extremes are still drawn values);
 *   - inspection resolves the RAW series: the keyboard reaches a datum the
 *     decimation did not paint, and reads its true value;
 *   - the data table (ADR-0022's data scope) keeps every raw row;
 *   - a declared gap still breaks the painted line;
 *   - below the budget nothing changes at all.
 *
 * Fixtures use `curve="linear"` and `NO_MARGINS` (the file-family convention)
 * so path coordinates are data positions, not bezier scaffolding.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import type { ActivePoint, SeriesDatum } from "@silkplot/core";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { HEIGHT, NO_MARGINS, WIDTH, markD, markPaths, moveCount, pathYs } from "./support";

const T0 = Date.UTC(2026, 0, 1);
const MINUTE = 60_000;
const at = (i: number): Date => new Date(T0 + i * MINUTE);

/**
 * 1,000 minutes of a deterministic wave, plus one planted spike at index 500
 * whose value (99) is the global maximum and one trough at 501 (the global
 * minimum, -9). Adjacent extremes, so any per-bucket reduction must keep both
 * from ONE bucket — the exact case a naive sampler loses.
 */
const DENSE: TimePoint[] = Array.from({ length: 1000 }, (_, i) => ({
  t: at(i),
  y: i === 500 ? 99 : i === 501 ? -9 : Math.round(20 + 10 * Math.sin(i / 7)),
}));

const mount = (props: Record<string, unknown> = {}) =>
  render(() => (
    <LineChart
      title="Decimation contract"
      data={DENSE}
      width={WIDTH}
      height={HEIGHT}
      margins={NO_MARGINS}
      curve="linear"
      {...props}
    />
  ));

describe("the decimation budget bounds the painted points", () => {
  it("paints at most the budget, and paints the envelope's extremes", () => {
    const { container } = mount({ decimation: 100 });
    const ys = pathYs(markD(container));
    expect(ys.length).toBeGreaterThan(0);
    expect(ys.length).toBeLessThanOrEqual(100);

    // The envelope claim, on pixels: the decimated painting spans EXACTLY the
    // pixel range the raw painting spans — the same scale (y is pinned to the
    // data scope either way), so if either adjacent extreme were dropped the
    // decimated range would be visibly narrower than the raw one.
    const raw = pathYs(markD(mount({}).container));
    expect(Math.min(...ys)).toBeCloseTo(Math.min(...raw), 3);
    expect(Math.max(...ys)).toBeCloseTo(Math.max(...raw), 3);
  });

  it("is the identity below the budget — every point painted, exactly as without the prop", () => {
    const { container } = mount({ decimation: 5000 });
    const bare = mount({});
    expect(markD(container)).toBe(markD(bare.container));
    expect(pathYs(markD(container))).toHaveLength(DENSE.length);
  });

  it("keeps every raw row in the data table (the table is data scope, not paint)", () => {
    const { container } = mount({ decimation: 100 });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(DENSE.length);
  });
});

describe("inspection resolves the raw series, not the painted one", () => {
  it("the keyboard reaches an unpainted datum and reads its true value", async () => {
    const active: (ActivePoint<SeriesDatum> | undefined)[] = [];
    const { container } = mount({
      decimation: 100,
      onActivePointChange: (a: ActivePoint<SeriesDatum> | undefined) => active.push(a),
    });

    // Index 1's wave value survives nowhere near the front under a 100-point
    // budget over 1,000 points (bucket 0 spans ten points and keeps two), so
    // stepping to the SECOND raw datum reaches a point the path does not
    // paint. Prove that premise first, on the drawn x positions: with linear
    // spacing, raw index i sits at i * WIDTH / 999.
    const step = WIDTH / (DENSE.length - 1);
    const paintedXs = new Set(
      (markD(container).match(/[ML]([\d.]+)/g) ?? []).map((m) =>
        Math.round(Number(m.slice(1)) / step),
      ),
    );
    expect(paintedXs.has(1)).toBe(false);

    const surface = container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]");
    expect(surface).not.toBeNull();
    surface!.focus();
    surface!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    surface!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    const last = active[active.length - 1];
    expect(last).toBeDefined();
    // The SECOND raw datum — its true instant and value, straight from the
    // un-decimated series (ADR-0023: the active point is the truth).
    expect((last!.datum.t as Date).getTime()).toBe(at(1).getTime());
    expect(last!.datum.y).toBe(DENSE[1]!.y);
  });
});

describe("gaps survive decimation", () => {
  it("a non-finite reading still breaks the painted line", () => {
    // A hole mid-series: the painted line must break there even though the
    // decimation reduces 1,000 points to 100 — the gap datum rides through
    // its bucket (ADR-0023: decimation can never connect across missing data).
    const withGap: TimePoint[] = DENSE.map((d, i) => (i === 250 ? { t: d.t, y: Number.NaN } : d));
    const gapped = render(() => (
      <LineChart
        title="Decimation gap"
        data={withGap}
        decimation={100}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    expect(moveCount(markD(gapped.container))).toBe(2);
  });
});

describe("multi-series: the budget applies per series", () => {
  it("bounds each series' painted points independently", () => {
    const series = [
      { id: "a", label: "A", data: DENSE },
      { id: "b", label: "B", data: DENSE.map((d) => ({ t: d.t, y: d.y + 5 })) },
    ];
    const { container } = render(() => (
      <LineChart
        title="Decimation multi"
        series={series}
        decimation={100}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const paths = markPaths(container);
    expect(paths).toHaveLength(2);
    for (const p of paths) {
      const n = pathYs(p.getAttribute("d") ?? "").length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});
