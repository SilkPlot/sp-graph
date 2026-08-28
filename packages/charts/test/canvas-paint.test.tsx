/**
 * Canvas paint primitives — the helpers cartesian marks call, proven without
 * a chart so an uncovered branch cannot hide behind a green LineChart suite.
 *
 * Charts coverage is floored at 100% functions and 100% lines. These cases
 * exist because `CartesianFrame` never mounts a zero-size plot, Solid assigns
 * `ref` before the first effect, and a disconnected host is not a composed
 * chart. Leaving any of those untested is how a helper silently stops doing
 * what its comment says.
 */
import { describe, expect, it } from "vitest";
import {
  layoutPackFromObservations,
  layoutPieFromObservations,
  layoutTreeFromObservations,
  layoutTreemapFromObservations,
  linearScale,
  type NormalizedCategory,
} from "@silkplot/core";
import { rankedBarRect } from "../src/BarChart";
import {
  canvasMarksOf,
  canvasPlotsOf,
  marksOnCanvas,
  rememberCanvasMarks,
  type CanvasMark,
} from "../src/canvas-marks";
import {
  clipPlotArea,
  paintBar,
  paintCircle,
  paintFill,
  paintLine,
  paintRing,
  paintStroke,
  paintText,
  pushMark,
} from "../src/canvas-paint";
import { CATEGORICAL_PATTERN_COUNT, paintCategoricalPattern } from "../src/canvas-pattern";
import { syncCanvasPlot } from "../src/canvas-plot";
import { paintAxis, paintGridlines } from "../src/canvas-frame";
import {
  paintBrush,
  paintEmptyMark,
  paintPointMark,
  paintReferences,
} from "../src/canvas-chrome";
import { paintCartesianSurface } from "../src/canvas-surface";
import { createStyleResolver, parseDash } from "../src/canvas-style";
import { heatmapFill, paintHeatmapCell } from "../src/heatmap-paint";
import {
  hierarchyFill,
  paintPackLayout,
  paintTreeLayout,
  paintTreemapLayout,
} from "../src/hierarchy-paint";
import { pieFill, paintPieSlice } from "../src/pie-paint";

function context2d(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("expected a 2d context");
  return { canvas, ctx };
}

function resolver(host = document.body) {
  return createStyleResolver(host);
}

describe("parseDash", () => {
  it("is empty for undefined, none, and the empty string", () => {
    expect(parseDash(undefined)).toEqual([]);
    expect(parseDash("none")).toEqual([]);
    expect(parseDash("")).toEqual([]);
  });

  it("accepts spaces, commas, a px suffix, and skips a token that is not a number", () => {
    expect(parseDash("4 2")).toEqual([4, 2]);
    expect(parseDash("4,2")).toEqual([4, 2]);
    expect(parseDash("4px, 2px")).toEqual([4, 2]);
    expect(parseDash("4, foo, 2")).toEqual([4, 2]);
    expect(parseDash("  ,  8  ")).toEqual([8]);
  });
});

describe("createStyleResolver", () => {
  it("falls back on a disconnected host: currentColor and var() to black, a literal kept, none transparent", () => {
    const host = document.createElement("div");
    const resolve = createStyleResolver(host);
    expect(resolve.color("currentColor")).toBe("#000000");
    expect(resolve.color("var(--sp-color-fg)")).toBe("#000000");
    expect(resolve.color("#ff00aa")).toBe("#ff00aa");
    expect(resolve.color("none")).toBe("rgba(0, 0, 0, 0)");
    expect(resolve.color(undefined)).toBe("#000000");
    expect(resolve.dash("4 2")).toEqual([4, 2]);
    expect(resolve.dash(undefined)).toEqual([]);
    expect(resolve.dash("none")).toEqual([]);
    expect(resolve.font("11px")).toBe("11px sans-serif");
  });

  it("resolves against a live host, including var() and a dash list, and caches the result", () => {
    const host = document.createElement("div");
    host.style.color = "rgb(1, 2, 3)";
    host.style.setProperty("--sp-test", "#ff0000");
    host.style.setProperty("--sp-cat-dash-test", "6 3");
    document.body.appendChild(host);
    const resolve = createStyleResolver(host);
    const current = resolve.color("currentColor");
    expect(current).toMatch(/rgb/);
    expect(resolve.color("currentColor")).toBe(current);
    expect(host.style.color).toBe("rgb(1, 2, 3)");
    expect(resolve.color("none")).toBe("rgba(0, 0, 0, 0)");
    const token = resolve.color("var(--sp-test)");
    expect(token === "rgb(255, 0, 0)" || token === "#ff0000" || token.includes("255")).toBe(true);
    expect(host.style.color).toBe("rgb(1, 2, 3)");
    expect(resolve.dash("4 2")).toEqual(parseDash(resolve.dash("4 2").join(" ")));
    const dashed = resolve.dash("4 2");
    expect(dashed[0]).toBe(4);
    expect(dashed[1]).toBe(2);
    expect(resolve.dash("4 2")).toBe(dashed);
    expect(resolve.dash(undefined)).toEqual([]);
    expect(resolve.dash("")).toEqual([]);
    expect(resolve.dash("var(--sp-cat-dash-test, none)")).toEqual([6, 3]);
    expect(resolve.dash("var(--silkplot-no-such-dash, 5 3)")).toEqual([5, 3]);
    expect(resolve.dash("var(--sp-cat-dash-test, 8 2)")).toEqual([6, 3]);
    host.style.setProperty("--sp-cat-dash-none", "none");
    expect(resolve.dash("var(--sp-cat-dash-none, 8 2)")).toEqual([8, 2]);
    expect(resolve.dash("var(not-a-custom, 4 2)")).toEqual([4, 2]);
    const font = resolve.font("11px");
    expect(font).toMatch(/\d+px/);
    expect(resolve.font("11px")).toBe(font);
    host.remove();
  });

  it("does not create SVG elements to resolve colour or dash", () => {
    const namespaces: string[] = [];
    const original = document.createElementNS.bind(document);
    document.createElementNS = ((ns: string, name: string) => {
      namespaces.push(`${ns} ${name}`);
      return original(ns, name);
    }) as typeof document.createElementNS;
    try {
      const host = document.createElement("div");
      host.style.setProperty("--sp-test", "#00ff00");
      document.body.appendChild(host);
      const resolve = createStyleResolver(host);
      resolve.color("currentColor");
      resolve.color("var(--sp-test, currentColor)");
      resolve.dash("var(--sp-cat-dash-missing, 4 2)");
      resolve.font("11px");
      expect(namespaces).toEqual([]);
      expect(host.querySelector("svg")).toBeNull();
      host.remove();
    } finally {
      document.createElementNS = original;
    }
  });

  it("uses a var() dash fallback on a disconnected host rather than parsing the var() string", () => {
    const host = document.createElement("div");
    const resolve = createStyleResolver(host);
    expect(resolve.dash("var(--sp-cat-dash-1, 6 3)")).toEqual([6, 3]);
    expect(resolve.dash("var(--sp-cat-dash-1)")).toEqual([]);
    expect(resolve.dash("not-a-pattern")).toEqual([]);
  });
});

describe("clipPlotArea", () => {
  it("hides paint past the inner-plot rect", () => {
    const { ctx } = context2d();
    ctx.fillStyle = "rgb(255, 0, 0)";
    ctx.fillRect(0, 0, 40, 40);
    ctx.save();
    clipPlotArea(ctx, 10, 10);
    ctx.fillStyle = "rgb(0, 0, 255)";
    ctx.fillRect(0, 0, 40, 40);
    ctx.restore();
    const inside = [...ctx.getImageData(5, 5, 1, 1).data];
    const outside = [...ctx.getImageData(20, 20, 1, 1).data];
    expect(inside[0]).toBe(0);
    expect(inside[2]).toBe(255);
    expect(outside[0]).toBe(255);
    expect(outside[2]).toBe(0);
  });
});

describe("paintStroke / paintFill", () => {
  it("is a no-op on empty geometry", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    expect(paintStroke(ctx, "", {}, resolve)).toBeUndefined();
    expect(paintFill(ctx, "", {}, resolve)).toBeUndefined();
  });

  it("records the path it stroked, with round caps on a solid line and butt caps on a dash", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const solid = paintStroke(ctx, "M0,0L10,0", { stroke: "#0072b2" }, resolve);
    expect(solid?.d).toBe("M0,0L10,0");
    expect(solid?.fill).toBe("none");
    expect(solid?.stroke).toBe("#0072b2");
    expect(solid?.strokeWidth).toBe("1.5");
    const dashed = paintStroke(
      ctx,
      "M0,1L10,1",
      { stroke: "currentColor", strokeWidth: 2, dash: "4 2" },
      resolve,
    );
    expect(dashed?.dash).toBe("4 2");
    expect(dashed?.strokeWidth).toBe("2");
    const noneDash = paintStroke(ctx, "M0,2L10,2", { dash: "none" }, resolve);
    expect(noneDash?.dash).toBe("none");
    const emptyDash = paintStroke(ctx, "M0,3L10,3", { dash: "" }, resolve);
    expect(emptyDash?.dash).toBe("");
  });

  it("fills with default opacity 0.2 when the caller does not name one", () => {
    const { ctx } = context2d();
    const filled = paintFill(ctx, "M0,0L10,0L10,10Z", { fill: "#56b4e9" }, resolver());
    expect(filled?.fill).toBe("#56b4e9");
    expect(filled?.fillOpacity).toBe("0.2");
    expect(filled?.stroke).toBe("none");
    const explicit = paintFill(
      ctx,
      "M0,0L8,0L8,8Z",
      { fill: "currentColor", fillOpacity: 0.5 },
      resolver(),
    );
    expect(explicit?.fillOpacity).toBe("0.5");
  });
});

describe("paintCircle / paintBar / pushMark", () => {
  it("fills a circle with the default radius and opacity", () => {
    const { ctx } = context2d();
    const mark = paintCircle(ctx, 4, 5, {}, resolver());
    expect(mark).toEqual({
      kind: "circle",
      cx: "4",
      cy: "5",
      r: "3",
      fill: "currentColor",
      fillOpacity: "1",
    });
    const named = paintCircle(
      ctx,
      1,
      2,
      { radius: 5, fill: "#009e73", fillOpacity: 0.4 },
      resolver(),
    );
    expect(named.r).toBe("5");
    expect(named.fill).toBe("#009e73");
    expect(named.fillOpacity).toBe("0.4");
  });

  it("outlines an active bar and leaves an inactive one unstroked", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const idle = paintBar(ctx, { x: 1, y: 2, width: 3, height: 4 }, {}, resolve);
    expect(idle.stroke).toBe("none");
    expect(idle.strokeWidth).toBe("0");
    expect(idle.fill).toBe("currentColor");
    const active = paintBar(
      ctx,
      { x: 0, y: 0, width: 8, height: 8 },
      { fill: "#e69f00", active: true },
      resolve,
    );
    expect(active.fill).toBe("#e69f00");
    expect(active.stroke).toBe("var(--sp-color-cursor, currentColor)");
    expect(active.strokeWidth).toBe("2");
  });

  it("pushes only a defined mark", () => {
    const into: CanvasMark[] = [];
    pushMark(into, undefined);
    expect(into).toEqual([]);
    pushMark(into, {
      kind: "path",
      d: "M0,0",
      fill: "none",
      stroke: "#000",
      strokeWidth: "1",
      dash: undefined,
      fillOpacity: undefined,
    });
    expect(into).toHaveLength(1);
  });
});

describe("the recorded mark surface", () => {
  it("is empty until a plot remembers, and concatenates every plot in a container", () => {
    const orphan = document.createElement("canvas");
    expect(marksOnCanvas(orphan)).toEqual([]);
    rememberCanvasMarks(orphan, [
      {
        kind: "path",
        d: "M0,0L1,1",
        fill: "none",
        stroke: "#000",
        strokeWidth: "1",
        dash: undefined,
        fillOpacity: undefined,
      },
    ]);
    expect(marksOnCanvas(orphan)[0]?.kind).toBe("path");

    const box = document.createElement("div");
    expect(canvasPlotsOf(box)).toEqual([]);
    expect(canvasMarksOf(box)).toEqual([]);
    const a = document.createElement("canvas");
    a.setAttribute("data-silkplot-canvas-plot", "");
    const b = document.createElement("canvas");
    b.setAttribute("data-silkplot-canvas-plot", "");
    box.append(a, b);
    rememberCanvasMarks(a, [
      {
        kind: "circle",
        cx: "1",
        cy: "2",
        r: "3",
        fill: "#000",
        fillOpacity: "1",
      },
    ]);
    rememberCanvasMarks(b, [
      {
        kind: "rect",
        x: "0",
        y: "0",
        width: "1",
        height: "1",
        fill: "#000",
        stroke: "none",
        strokeWidth: "0",
      },
    ]);
    expect(canvasPlotsOf(box)).toHaveLength(2);
    expect(canvasMarksOf(box).map((m) => m.kind)).toEqual(["circle", "rect"]);
  });
});

describe("syncCanvasPlot", () => {
  const noop = () => [];

  it("is a no-op when the element is not yet attached", () => {
    syncCanvasPlot(undefined, { width: 10, height: 10 }, noop);
  });

  it("records no marks and does not size the bitmap when the inner plot has collapsed", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    syncCanvasPlot(canvas, { width: 0, height: 10 }, () => {
      throw new Error("must not paint a collapsed plot");
    });
    expect(marksOnCanvas(canvas)).toEqual([]);
    expect(canvas.getAttribute("data-silkplot-plot-width")).toBe("0");
    expect(canvas.getAttribute("data-silkplot-plot-height")).toBe("10");
    syncCanvasPlot(canvas, { width: 10, height: 0 }, noop);
    expect(canvas.getAttribute("data-silkplot-plot-height")).toBe("0");
  });

  it("paints and remembers when the plot has area", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    syncCanvasPlot(canvas, { width: 20, height: 16 }, (ctx, plot, resolve) => {
      const mark = paintStroke(ctx, "M0,0L20,16", { stroke: "#000" }, resolve);
      expect(plot.width).toBe(20);
      return mark === undefined ? [] : [mark];
    });
    expect(canvas.width).toBe(Math.round(20 * window.devicePixelRatio));
    expect(marksOnCanvas(canvas)).toHaveLength(1);
    expect(canvas.getAttribute("data-silkplot-mark-d")).toBe("M0,0L20,16");
  });

  it("annotates axis-label count and clears the series path when none was painted", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    syncCanvasPlot(canvas, { width: 20, height: 16 }, (ctx, _plot, resolve) => {
      const mark = paintText(
        ctx,
        0,
        0,
        "0",
        { fill: "#000", fontSize: "11px" },
        resolve,
        "axis-label",
        { axis: "left" },
      );
      return mark === undefined ? [] : [mark];
    });
    expect(canvas.getAttribute("data-silkplot-axis-labels")).toBe("1");
    expect(canvas.getAttribute("data-silkplot-mark-d")).toBeNull();
  });

  it("translates to the plot origin and sizes the bitmap to the outer chart", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    syncCanvasPlot(
      canvas,
      { width: 20, height: 10, originX: 8, originY: 4, outerWidth: 40, outerHeight: 24 },
      (_ctx, plot) => {
        expect(plot.width).toBe(20);
        expect(plot.height).toBe(10);
        return [];
      },
    );
    expect(canvas.width).toBe(Math.round(40 * window.devicePixelRatio));
    expect(canvas.height).toBe(Math.round(24 * window.devicePixelRatio));
  });
});

describe("rankedBarRect", () => {
  const present: NormalizedCategory = {
    id: "a",
    label: "A",
    value: 40,
    sourceIndex: 0,
    state: "present",
  };
  const missing: NormalizedCategory = {
    id: "a",
    label: "A",
    value: null,
    sourceIndex: 0,
    state: "missing",
  };

  function model(bandAt: number | undefined, orientation: "vertical" | "horizontal") {
    const scale = Object.assign((_id: string) => bandAt, { bandwidth: () => 20 });
    return {
      band: () => scale,
      value: () => (n: number) => 100 - n,
      orientation: () => orientation,
    } as Parameters<typeof rankedBarRect>[0];
  }

  it("returns undefined when the category has no band or no value", () => {
    expect(rankedBarRect(model(undefined, "vertical"), present)).toBeUndefined();
    expect(rankedBarRect(model(8, "vertical"), missing)).toBeUndefined();
  });

  it("spans zero to the value on both orientations", () => {
    const vertical = rankedBarRect(model(8, "vertical"), present);
    expect(vertical).toEqual({ x: 8, y: 60, width: 20, height: 40 });
    const horizontal = rankedBarRect(model(12, "horizontal"), present);
    expect(horizontal).toEqual({ x: 60, y: 12, width: 40, height: 20 });
  });
});

describe("paintLine / paintText / paintRing", () => {
  it("records a dashed line, a rotated label, and a cursor ring", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const line = paintLine(
      ctx,
      0,
      1,
      10,
      1,
      { stroke: "#111", strokeWidth: 2, dash: "3 2", opacity: 0.5 },
      resolve,
      "grid",
      { axis: "x" },
    );
    expect(line.role).toBe("grid");
    expect(line.dash).toBe("3 2");
    const upright = paintText(
      ctx,
      4,
      5,
      "ok",
      { fill: "#222", rotate: 0, anchor: "center" },
      resolve,
      "axis-label",
      { axis: "bottom" },
    );
    expect(upright.rotation).toBeUndefined();
    const rotated = paintText(
      ctx,
      4,
      5,
      "ok",
      { fill: "#222", rotate: -45, anchor: "end" },
      resolve,
      "axis-label",
      { axis: "bottom" },
    );
    expect(rotated.rotation).toBe("-45");
    const ring = paintRing(ctx, 8, 9, { stroke: "#333", strokeWidth: 3, radius: 5 }, resolve);
    expect(ring.role).toBe("cursor");
    expect(ring.r).toBe("5");
    expect(ring.fill).toBe("none");
  });
});

describe("canvas frame and chrome", () => {
  const plot = { width: 100, height: 80 };

  function scale() {
    return linearScale({ domain: [0, 10], range: [0, 100] });
  }

  it("paints top and right axes as well as the left/bottom pair the frame uses", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const into: CanvasMark[] = [];
    paintAxis(ctx, { scale: scale(), orientation: "top", plot }, resolve, into);
    paintAxis(ctx, { scale: scale(), orientation: "right", plot }, resolve, into);
    paintGridlines(ctx, scale(), "x", plot, resolve, into);
    expect(into.some((m) => m.kind === "line" && m.role === "axis-domain" && m.axis === "top")).toBe(
      true,
    );
    expect(into.some((m) => m.kind === "line" && m.role === "axis-domain" && m.axis === "right")).toBe(
      true,
    );
    expect(into.some((m) => m.kind === "line" && m.role === "grid" && m.axis === "x")).toBe(true);
  });

  it("paints references, brush, point, and empty chrome, and no-ops a collapsed plot", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const into: CanvasMark[] = [];
    const valueRef = {
      id: "sla",
      label: "SLA",
      axis: "value" as const,
      at: 20,
      includeInDomain: true,
      style: {},
      sourceIndex: 0,
    };
    const timeRef = {
      id: "deploy",
      label: "Deploy",
      axis: "time" as const,
      at: 50,
      includeInDomain: true,
      style: { dash: [2, 2] },
      sourceIndex: 1,
    };
    paintReferences(ctx, [valueRef, timeRef], (r) => r.at, plot, resolve, into);
    expect(into.filter((m) => m.kind === "line" && m.role === "reference")).toHaveLength(2);
    paintReferences(ctx, [valueRef], () => 10, { width: 0, height: 10 }, resolve, into);
    paintBrush(ctx, 10, 40, plot.height, resolve, into);
    expect(into.some((m) => m.kind === "rect" && m.role === "brush")).toBe(true);
    paintPointMark(ctx, 12, 14, plot, resolve, into);
    expect(into.filter((m) => m.kind === "circle" && m.role === "cursor")).toHaveLength(2);
    paintEmptyMark(ctx, "Nothing here", plot, resolve, into);
    expect(into.some((m) => m.kind === "text" && m.role === "empty")).toBe(true);
  });

  it("paints a cartesian surface with and without grid and chrome", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const xScale = linearScale({ domain: [0, 10], range: [0, 100] });
    const yScale = linearScale({ domain: [0, 10], range: [80, 0] });
    const bare = paintCartesianSurface(ctx, plot, resolve, {
      grid: false,
      xScale,
      yScale,
      paintMarks: () => [],
    });
    expect(bare.some((m) => m.kind === "line" && m.role === "grid")).toBe(false);
    expect(bare.some((m) => m.kind === "line" && m.role === "axis-domain")).toBe(true);
    const withChrome = paintCartesianSurface(ctx, plot, resolve, {
      grid: true,
      xScale,
      yScale,
      xFormat: (v: number) => String(v),
      yFormat: (v: number) => String(v),
      xLabelRotation: -45,
      paintMarks: () => [],
      chrome: {
        references: [
          {
            id: "sla",
            label: "SLA",
            axis: "value",
            at: 5,
            includeInDomain: true,
            style: {},
            sourceIndex: 0,
          },
        ],
        position: () => 40,
        brush: { x0: 10, x1: 30 },
        point: { cx: 20, cy: 20 },
        empty: "empty",
      },
    });
    expect(withChrome.some((m) => m.kind === "line" && m.role === "grid")).toBe(true);
    expect(withChrome.some((m) => m.kind === "line" && m.role === "reference")).toBe(true);
    expect(withChrome.some((m) => m.kind === "rect" && m.role === "brush")).toBe(true);
  });
});

describe("heatmap cell paint", () => {
  it("fills, records hatch, and outlines the active cell", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const cold = paintHeatmapCell(
      ctx,
      { column: "a", row: "n", value: 0, x: 0, y: 0, width: 10, height: 10, t: 0, hatch: 0 },
      {},
      resolve,
    );
    expect(cold.hatch).toBe("0");
    expect(cold.stroke).toBe("none");
    expect(heatmapFill(0)).not.toBe(heatmapFill(1));
    const hot = paintHeatmapCell(
      ctx,
      { column: "b", row: "s", value: 8, x: 10, y: 0, width: 10, height: 10, t: 1, hatch: 4 },
      { active: true },
      resolve,
    );
    expect(hot.hatch).toBe("4");
    expect(hot.stroke).not.toBe("none");
    expect(heatmapFill(-1)).toBe(heatmapFill(0));
    expect(heatmapFill(2)).toBe(heatmapFill(1));
  });
});

describe("pie slice paint", () => {
  it("fills, records pattern and label, and outlines the active slice", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const laid = layoutPieFromObservations([{ label: "A", value: 1 }], {
      width: 40,
      height: 40,
      hole: 0,
    });
    const slice = laid.slices[0]!;
    const quiet = paintPieSlice(ctx, slice, {}, resolve);
    const path = quiet.find((m) => m.kind === "path");
    const label = quiet.find((m) => m.kind === "text");
    expect(path?.kind === "path" && path.pattern).toBe("0");
    expect(path?.kind === "path" && path.stroke).toBe("none");
    expect(label?.kind === "text" && label.text).toBe("A");
    expect(pieFill(0)).not.toBe(pieFill(1));
    const active = paintPieSlice(ctx, slice, { active: true }, resolve);
    expect(active.some((m) => m.kind === "path" && m.strokeWidth === "2")).toBe(true);
    expect(paintPieSlice(ctx, { ...slice, d: "" }, {}, resolve)).toEqual([]);
    expect(paintPieSlice(ctx, { ...slice, outerRadius: 0 }, {}, resolve)).toEqual([]);
  });

  it("paints every pattern slot and a donut ring", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const pie = layoutPieFromObservations([{ label: "A", value: 1 }], {
      width: 40,
      height: 40,
      hole: 0,
    });
    const base = pie.slices[0]!;
    for (let pattern = 0; pattern < 8; pattern += 1) {
      const marks = paintPieSlice(ctx, { ...base, pattern }, {}, resolve);
      expect(marks.some((m) => m.kind === "path" && m.pattern === String(pattern))).toBe(true);
    }
    const donut = layoutPieFromObservations([{ label: "A", value: 1 }], {
      width: 40,
      height: 40,
      hole: 0.5,
    });
    const ring = paintPieSlice(ctx, donut.slices[0]!, { active: true }, resolve);
    expect(ring.some((m) => m.kind === "path" && Number(m.innerRadius) > 0)).toBe(true);
  });
});

describe("hierarchy node paint", () => {
  const ORG = [
    { id: "clinic", value: 0 },
    { id: "leaf", parent: "clinic", value: 4 },
  ];

  it("paints tree links, patterned nodes, labels, and an active outline", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const tree = layoutTreeFromObservations(ORG, { width: 80, height: 80 });
    const quiet = paintTreeLayout(ctx, tree, undefined, resolve);
    expect(quiet.some((m) => m.kind === "line" && m.role === "link")).toBe(true);
    expect(quiet.some((m) => m.kind === "circle" && m.pattern === "0")).toBe(true);
    expect(quiet.some((m) => m.kind === "text" && m.role === "node-label" && m.text === "clinic")).toBe(
      true,
    );
    expect(hierarchyFill(0)).not.toBe(hierarchyFill(1));
    const active = paintTreeLayout(ctx, tree, tree.nodes[0]!.sourceIndex, resolve);
    expect(active.some((m) => m.kind === "circle" && m.strokeWidth === "2")).toBe(true);
    expect(paintTreeLayout(ctx, { nodes: [], links: [] }, undefined, resolve)).toEqual([]);
  });

  it("paints treemap rects and pack circles, including every pattern slot", () => {
    const { ctx } = context2d();
    const resolve = resolver();
    const treemap = layoutTreemapFromObservations(ORG, { width: 80, height: 80 });
    const pack = layoutPackFromObservations(ORG, { width: 80, height: 80 });
    const cells = paintTreemapLayout(ctx, treemap, treemap[0]!.sourceIndex, resolve);
    expect(cells.some((m) => m.kind === "rect" && m.pattern !== undefined)).toBe(true);
    expect(cells.some((m) => m.kind === "rect" && m.strokeWidth === "2")).toBe(true);
    const circles = paintPackLayout(ctx, pack, pack[0]!.sourceIndex, resolve);
    expect(circles.some((m) => m.kind === "circle" && Number(m.r) > 0)).toBe(true);
    expect(
      paintPackLayout(ctx, pack, undefined, resolve).some((m) => m.kind === "circle" && m.stroke === "none"),
    ).toBe(true);
    expect(
      paintTreemapLayout(ctx, treemap, undefined, resolve).some((m) => m.kind === "rect" && m.stroke === "none"),
    ).toBe(true);
    expect(paintTreemapLayout(ctx, [], undefined, resolve)).toEqual([]);
    expect(paintPackLayout(ctx, [], undefined, resolve)).toEqual([]);
    for (let pattern = 0; pattern < CATEGORICAL_PATTERN_COUNT; pattern += 1) {
      paintCategoricalPattern(ctx, 12, pattern, resolve);
    }
  });
});
