/**
 * The dense-commit fast paths.
 *
 * Both exist to make a viewport commit on a dense series cheaper, and both
 * are only acceptable if they change nothing a reader can see: the affine
 * mapper must return the very number the scale returns, and the linear
 * serializer must emit the very string d3-shape emits. These tests hold the
 * fast paths to the originals on data that exercises rounding, gaps,
 * isolated points, and non-finite values, rather than on hand-picked cases.
 */
import { line as d3Line, curveLinear } from "d3-shape";
import { scaleLinear, scaleLog, scaleTime } from "d3-scale";
import { describe, expect, it } from "vitest";
import { affineMapper, affineOf, linePath, linearScale, timeScale } from "../src/index";
import type { PathSink } from "../src/index";

/** A tiny deterministic generator; no Math.random in a test. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("affineOf / affineMapper", () => {
  it("matches a linear scale bit for bit across its domain and beyond it", () => {
    const scale = linearScale({ domain: [-7.25, 1234.5], range: [820, 0], nice: false });
    const map = affineMapper(scale);
    expect(affineOf(scale)).toBeDefined();
    const random = lcg(7);
    for (let i = 0; i < 2000; i++) {
      const v = -500 + random() * 3000;
      expect(map(v)).toBe(scale(v));
    }
  });

  it("matches a niced time scale on the millisecond values a Date coerces to", () => {
    const scale = timeScale({
      domain: [new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z")],
      range: [0, 1032],
    });
    const map = affineMapper(scale);
    const random = lcg(11);
    for (let i = 0; i < 2000; i++) {
      const t = Math.floor(Date.UTC(2025, 11, 31) + random() * 3 * 86_400_000);
      expect(map(t)).toBe(scale(new Date(t)));
    }
  });

  it("declines a clamped, piecewise, or logarithmic scale and falls back to calling it", () => {
    const clamped = scaleLinear().domain([0, 10]).range([0, 100]).clamp(true);
    expect(affineOf(clamped)).toBeUndefined();
    expect(affineMapper(clamped)(25)).toBe(clamped(25));
    const piecewise = scaleLinear().domain([0, 5, 10]).range([0, 10, 100]);
    expect(affineOf(piecewise)).toBeUndefined();
    expect(affineMapper(piecewise)(7)).toBe(piecewise(7));
    const log = scaleLog().domain([1, 1000]).range([0, 300]);
    expect(affineOf(log as never)).toBeUndefined();
    expect(affineMapper(log as never)(10)).toBe(log(10));
    const degenerate = scaleLinear().domain([3, 3]).range([0, 100]);
    expect(affineOf(degenerate)).toBeUndefined();
    expect(affineMapper(degenerate)(3)).toBe(degenerate(3));
    const time = scaleTime().domain([new Date(0), new Date(1000)]).range([0, 10]);
    expect(affineOf(time)).toBeDefined();
  });
});

describe("linePath, linear curve", () => {
  interface P {
    x: number;
    y: number | null;
  }
  const reference = (data: readonly P[]) =>
    d3Line<P>()
      .x((d) => d.x)
      .y((d) => d.y as number)
      .defined((d) => d.y !== null && Number.isFinite(d.y))
      .curve(curveLinear)(data) ?? "";
  const fast = (data: readonly P[], sink?: PathSink) =>
    linePath(data, {
      x: (d) => d.x,
      y: (d) => d.y as number,
      defined: (d) => d.y !== null && Number.isFinite(d.y),
      curve: "linear",
      sink,
    });

  it("is byte-identical to d3-shape on random series with gaps, isolated points, and awkward decimals", () => {
    const random = lcg(2026);
    for (let series = 0; series < 60; series++) {
      const n = 1 + Math.floor(random() * 400);
      const data: P[] = [];
      for (let i = 0; i < n; i++) {
        const r = random();
        const y =
          r < 0.08 ? null : r < 0.1 ? Number.NaN : (random() - 0.5) * 10 ** Math.floor(random() * 7);
        data.push({ x: i * 1.0005 + random() / 3, y });
      }
      expect(fast(data)).toBe(reference(data));
    }
  });

  it("closes a run of exactly one point with Z, as d3's linear curve does", () => {
    const data: P[] = [{ x: 1, y: 2 }, { x: 2, y: null }, { x: 3, y: 4 }, { x: 4, y: 5 }];
    expect(fast(data)).toBe("M1,2ZM3,4L4,5");
    expect(fast(data)).toBe(reference(data));
    expect(fast([{ x: 0.0004, y: -0.0004 }])).toBe(reference([{ x: 0.0004, y: -0.0004 }]));
    expect(fast([])).toBe("");
  });

  it("feeds a sink the same commands and rounded coordinates the string records", () => {
    const commands: string[] = [];
    const sink: PathSink = {
      moveTo: (x, y) => commands.push(`M${x},${y}`),
      lineTo: (x, y) => commands.push(`L${x},${y}`),
      closePath: () => commands.push("Z"),
    };
    const data: P[] = [
      { x: 1 / 3, y: 2 },
      { x: 2, y: 2.00049 },
      { x: 3, y: null },
      { x: 4, y: 5 },
      { x: 5, y: null },
      { x: 6, y: 6 },
      { x: 7, y: 7 },
    ];
    const d = fast(data, sink);
    expect(commands.join("")).toBe(d);
    expect(d).toBe("M0.333,2L2,2M4,5ZM6,6L7,7");
  });

  it("leaves the sink untouched for a non-linear curve", () => {
    let touched = 0;
    const sink: PathSink = {
      moveTo: () => touched++,
      lineTo: () => touched++,
      closePath: () => touched++,
    };
    const d = linePath([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], {
      x: (d: P) => d.x,
      y: (d: P) => d.y as number,
      curve: "monotoneX",
      sink,
    });
    expect(d).toContain("C");
    expect(touched).toBe(0);
  });
});
