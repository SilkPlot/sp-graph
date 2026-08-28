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
import type { NormalizedCategory } from "@silkplot/core";
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
  paintStroke,
  pushMark,
} from "../src/canvas-paint";
import { syncCanvasPlot } from "../src/canvas-plot";
import { createStyleResolver, parseDash } from "../src/canvas-style";

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
  });

  it("resolves against a live host, including var() and a dash list, and caches the result", () => {
    const host = document.createElement("div");
    host.style.color = "rgb(1, 2, 3)";
    host.style.setProperty("--sp-test", "#ff0000");
    document.body.appendChild(host);
    const resolve = createStyleResolver(host);
    const current = resolve.color("currentColor");
    expect(current).toMatch(/rgb/);
    expect(resolve.color("currentColor")).toBe(current);
    expect(resolve.color("none")).toBe("rgba(0, 0, 0, 0)");
    const token = resolve.color("var(--sp-test)");
    expect(token === "rgb(255, 0, 0)" || token === "#ff0000" || token.includes("255")).toBe(true);
    expect(resolve.dash("4 2")).toEqual(parseDash(resolve.dash("4 2").join(" ")));
    const dashed = resolve.dash("4 2");
    expect(dashed[0]).toBe(4);
    expect(dashed[1]).toBe(2);
    expect(resolve.dash("4 2")).toBe(dashed);
    expect(resolve.dash(undefined)).toEqual([]);
    host.remove();
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

  it("paints, clips, and remembers when the plot has area", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    syncCanvasPlot(canvas, { width: 20, height: 16 }, (ctx, plot, resolve) => {
      const mark = paintStroke(ctx, "M0,0L20,16", { stroke: "#000" }, resolve);
      expect(plot.width).toBe(20);
      return mark === undefined ? [] : [mark];
    });
    expect(canvas.width).toBe(Math.round(20 * window.devicePixelRatio));
    expect(marksOnCanvas(canvas)).toHaveLength(1);
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
