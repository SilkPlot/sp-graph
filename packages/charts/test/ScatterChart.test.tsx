/**
 * ScatterChart maps each `{x, y}` datum through two independent linear
 * scales (built from the data's own extent, not a zero-forced baseline) and
 * renders one `<circle>` per point. These tests assert structure (an `<svg>`,
 * one circle per datum, `cx`/`cy` matching a scale built with the same
 * domain/range, both axes present) and NaN-free geometry in the empty and
 * single-point degenerate cases, rather than exact d3-derived values, which
 * are version-sensitive. Widths/heights are passed explicitly so tests are
 * synchronous and do not depend on ChartRoot's async ResizeObserver
 * measurement.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { ScatterChart } from "../src/index";
import type { XYPoint } from "../src/index";
import { extentOf, linearScale } from "@silkplot/core";

const DATA: XYPoint[] = [
  { x: 1, y: 3 },
  { x: 4, y: 7 },
  { x: 2, y: -2 },
  { x: 9, y: 9 },
];

const WIDTH = 400;
const HEIGHT = 300;
const MARGINS = { top: 8, right: 12, bottom: 24, left: 40 };
const INNER_WIDTH = WIDTH - MARGINS.left - MARGINS.right;
const INNER_HEIGHT = HEIGHT - MARGINS.top - MARGINS.bottom;

function getCircles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(container.querySelectorAll("svg > g > circle")) as SVGCircleElement[];
}

describe("ScatterChart — structure", () => {
  it("renders an <svg>", () => {
    const { container } = render(() => <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders one <circle> per datum", () => {
    const { container } = render(() => <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(getCircles(container)).toHaveLength(DATA.length);
  });

  it("renders both a left and a bottom axis", () => {
    const { container } = render(() => <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} />);
    expect(container.querySelector('g[data-silkplot-axis="left"]')).not.toBeNull();
    expect(container.querySelector('g[data-silkplot-axis="bottom"]')).not.toBeNull();
  });

  it("applies the accessible title as an <svg><title>", () => {
    const { container } = render(() => (
      <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} title="Measurements" />
    ));
    expect(container.querySelector("svg > title")?.textContent).toBe("Measurements");
  });
});

describe("ScatterChart — scales use the data extent, not a zero-forced domain", () => {
  it("cx/cy match linearScale built over the raw x/y extent (no Math.min(0, lo))", () => {
    const { container } = render(() => <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} />);
    const circles = getCircles(container);

    const xs = DATA.map((d) => d.x);
    const ys = DATA.map((d) => d.y);
    const x = linearScale({
      domain: [Math.min(...xs), Math.max(...xs)],
      range: [0, INNER_WIDTH],
    });
    const y = linearScale({
      domain: [Math.min(...ys), Math.max(...ys)],
      range: [INNER_HEIGHT, 0],
    });

    DATA.forEach((d, i) => {
      const circle = circles[i]!;
      expect(Number(circle.getAttribute("cx"))).toBeCloseTo(x(d.x), 6);
      expect(Number(circle.getAttribute("cy"))).toBeCloseTo(y(d.y), 6);
    });
  });
});

/**
 * Replacing the series on a MOUNTED chart. See LineChart's equivalent block for
 * why the fixed-data tests above cannot reach this and why these watch Y.
 *
 * Scatter needs three points per case, not two. Under the "extent" policy the
 * lowest datum always lands on the bottom of the area and the highest on the
 * top, so a two-point series occupies the same two pixels whatever its values —
 * it cannot tell a recomputed scale from a frozen one. A middle datum can.
 */
describe("ScatterChart — data replacement", () => {
  const BEFORE: XYPoint[] = [
    { x: 1, y: 1 },
    { x: 1.5, y: 1.5 },
    { x: 2, y: 2 },
  ];
  const AFTER: XYPoint[] = [
    { x: 100, y: 100 },
    { x: 130, y: 140 },
    { x: 150, y: 150 },
  ];

  /** The scales ScatterChart composes, rebuilt from the same inputs. */
  function scalesFor(data: readonly XYPoint[]) {
    return {
      x: linearScale({ domain: extentOf(data, (d) => d.x), range: [0, INNER_WIDTH] }),
      y: linearScale({ domain: extentOf(data, (d) => d.y), range: [INNER_HEIGHT, 0] }),
    };
  }

  /** Assert every circle sits where the CURRENT series puts it. */
  function expectPointsTrack(container: HTMLElement, data: readonly XYPoint[]): void {
    const { x, y } = scalesFor(data);
    const circles = getCircles(container);
    expect(circles).toHaveLength(data.length);

    data.forEach((d, i) => {
      const cx = Number(circles[i]?.getAttribute("cx"));
      const cy = Number(circles[i]?.getAttribute("cy"));
      expect(Number.isFinite(cy)).toBe(true);
      expect(cx).toBeCloseTo(x(d.x), 6);
      expect(cy).toBeCloseTo(y(d.y), 6);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(INNER_HEIGHT);
    });
  }

  it("rescales y when the values change", () => {
    const [data, setData] = createSignal<XYPoint[]>(BEFORE);
    const { container } = render(() => <ScatterChart data={data()} width={WIDTH} height={HEIGHT} />);
    expectPointsTrack(container, BEFORE);

    setData(AFTER);

    expectPointsTrack(container, AFTER);
    // Guard against a vacuous pass: a shared y-domain would satisfy every
    // assertion above without the scale ever recomputing.
    expect(scalesFor(AFTER).y.domain()).not.toEqual(scalesFor(BEFORE).y.domain());
    // And guard the choice of fixture: the middle point must actually move, or
    // the extent policy would pin all three to the same pixels regardless.
    expect(scalesFor(AFTER).y(AFTER[1]?.y as number)).not.toBeCloseTo(
      scalesFor(BEFORE).y(BEFORE[1]?.y as number),
      3,
    );
  });

  it("rescales y when the domain moves entirely, with no forced zero", () => {
    // Wholly negative, and nowhere near the original domain. "extent" must not
    // drag zero in: the cloud fills the area on its own terms.
    const moved: XYPoint[] = [
      { x: -60, y: -60 },
      { x: -40, y: -25 },
      { x: -20, y: -10 },
    ];
    const [data, setData] = createSignal<XYPoint[]>(BEFORE);
    const { container } = render(() => <ScatterChart data={data()} width={WIDTH} height={HEIGHT} />);

    setData(moved);

    expectPointsTrack(container, moved);
    expect(scalesFor(moved).y.domain()).toEqual([-60, -10]);
    expect(scalesFor(moved).y.domain()).not.toEqual(scalesFor(BEFORE).y.domain());
  });

  it("rescales y when only the cardinality changes", () => {
    const longer: XYPoint[] = [
      { x: 1, y: 1 },
      { x: 1.5, y: 1.5 },
      { x: 2, y: 2 },
      { x: 3, y: 40 },
    ];
    const [data, setData] = createSignal<XYPoint[]>(BEFORE);
    const { container } = render(() => <ScatterChart data={data()} width={WIDTH} height={HEIGHT} />);

    setData(longer);

    // The appended point is the new maximum, so the domain must grow with it.
    expectPointsTrack(container, longer);
    expect(scalesFor(longer).y.domain()).not.toEqual(scalesFor(BEFORE).y.domain());
  });

  it("survives empty -> populated -> empty without emitting NaN", () => {
    const [data, setData] = createSignal<XYPoint[]>([]);
    const { container } = render(() => <ScatterChart data={data()} width={WIDTH} height={HEIGHT} />);
    const noNaN = (): void => {
      container.querySelectorAll("circle, path").forEach((el) => {
        for (const attr of ["cx", "cy", "d"]) {
          const value = el.getAttribute(attr);
          if (value !== null) expect(value).not.toContain("NaN");
        }
      });
    };
    expect(getCircles(container)).toHaveLength(0);
    noNaN();

    setData(AFTER);
    expectPointsTrack(container, AFTER);
    noNaN();

    setData([]);
    expect(getCircles(container)).toHaveLength(0);
    noNaN();
  });
});

describe("ScatterChart — props", () => {
  it("applies a custom radius", () => {
    const { container } = render(() => (
      <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} radius={7} />
    ));
    getCircles(container).forEach((c) => {
      expect(c.getAttribute("r")).toBe("7");
    });
  });

  it("defaults radius to 3, fill to currentColor, and fillOpacity to 1", () => {
    const { container } = render(() => <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} />);
    getCircles(container).forEach((c) => {
      expect(c.getAttribute("r")).toBe("3");
      expect(c.getAttribute("fill")).toBe("currentColor");
      expect(c.getAttribute("fill-opacity")).toBe("1");
    });
  });

  it("applies custom fill and fillOpacity", () => {
    const { container } = render(() => (
      <ScatterChart data={DATA} width={WIDTH} height={HEIGHT} fill="steelblue" fillOpacity={0.5} />
    ));
    getCircles(container).forEach((c) => {
      expect(c.getAttribute("fill")).toBe("steelblue");
      expect(c.getAttribute("fill-opacity")).toBe("0.5");
    });
  });
});

describe("ScatterChart — empty data", () => {
  it("does not throw and renders no circles with no NaN geometry anywhere", () => {
    expect(() => render(() => <ScatterChart data={[]} width={WIDTH} height={HEIGHT} />)).not.toThrow();

    const { container } = render(() => <ScatterChart data={[]} width={WIDTH} height={HEIGHT} />);
    expect(getCircles(container)).toHaveLength(0);

    container.querySelectorAll("circle, path").forEach((el) => {
      for (const attr of ["cx", "cy", "d"]) {
        const value = el.getAttribute(attr);
        if (value !== null) expect(value).not.toContain("NaN");
      }
    });
  });
});

describe("ScatterChart — single-point series (degenerate zero-width domain)", () => {
  it("does not produce NaN cx/cy even though x and y each have a single value", () => {
    const single: XYPoint[] = [{ x: 5, y: 5 }];
    expect(() =>
      render(() => <ScatterChart data={single} width={WIDTH} height={HEIGHT} />),
    ).not.toThrow();

    const { container } = render(() => (
      <ScatterChart data={single} width={WIDTH} height={HEIGHT} />
    ));
    const circles = getCircles(container);
    expect(circles).toHaveLength(1);

    const cx = Number(circles[0]!.getAttribute("cx"));
    const cy = Number(circles[0]!.getAttribute("cy"));
    expect(Number.isNaN(cx)).toBe(false);
    expect(Number.isNaN(cy)).toBe(false);
    // A zero-width domain scale (even with `nice`) collapses to a single
    // output value — the midpoint of the range — rather than throwing or
    // producing NaN; assert the finite fallback lands inside the plot.
    expect(cx).toBeGreaterThanOrEqual(0);
    expect(cx).toBeLessThanOrEqual(INNER_WIDTH);
    expect(cy).toBeGreaterThanOrEqual(0);
    expect(cy).toBeLessThanOrEqual(INNER_HEIGHT);
  });
});
