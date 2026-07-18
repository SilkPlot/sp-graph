/**
 * Crosshair, TooltipAnchor and ChartAnnouncer, per ADR-0002.
 *
 * The primitives are testable without a pointer, which is the point of the ADR:
 * they are told a position. So most of this gives them a position and asserts
 * what renders. Two tests earn their keep beyond that:
 *
 *   - the cursor and the tooltip, given the SAME point, must land on the same
 *     pixel. Only the tooltip adds the margins; if both did, or neither, the
 *     tooltip would sit a margin away from the line it describes.
 *   - a simulated pointer move must surface the datum actually nearest, which
 *     is the whole feature and the one thing a position-only test cannot show.
 */
import { describe, expect, it } from "vitest";
import { createSignal, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { linearScale, createHitIndex } from "@silkplot/core";
import {
  Crosshair,
  TooltipAnchor,
  ChartAnnouncer,
  ChartRoot,
  SvgLayer,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "../src/index";

const W = 400;
const H = 300;
const BOUNDS = resolveBounds(W, H, DEFAULT_MARGINS);

function renderInBounds(children: () => JSX.Element) {
  return render(() => (
    // biome-ignore lint/a11y/noSvgWithoutTitle: test harness element, never rendered to a user
    <svg>
      <ChartBoundsContext.Provider value={() => BOUNDS}>
        {children()}
      </ChartBoundsContext.Provider>
    </svg>
  ));
}

const rule = (c: HTMLElement, axis: "x" | "y") =>
  c.querySelector(`[data-silkplot-crosshair-rule="${axis}"]`);
const num = (el: Element | null, attr: string) => Number(el?.getAttribute(attr));

describe("Crosshair", () => {
  it("draws a vertical rule down the plot at the given inner-x", () => {
    const { container } = renderInBounds(() => <Crosshair x={120} />);
    const v = rule(container, "x");
    expect(num(v, "x1")).toBe(120);
    expect(num(v, "x2")).toBe(120);
    expect(num(v, "y1")).toBe(0);
    expect(num(v, "y2")).toBe(BOUNDS.innerHeight);
  });

  it("draws a horizontal rule across the plot at the given inner-y", () => {
    const { container } = renderInBounds(() => <Crosshair y={60} />);
    const h = rule(container, "y");
    expect(num(h, "y1")).toBe(60);
    expect(num(h, "x2")).toBe(BOUNDS.innerWidth);
  });

  it("draws both when given both", () => {
    const { container } = renderInBounds(() => <Crosshair x={10} y={20} />);
    expect(rule(container, "x")).not.toBeNull();
    expect(rule(container, "y")).not.toBeNull();
  });

  it("renders nothing when there is no active point", () => {
    const { container } = renderInBounds(() => <Crosshair />);
    expect(rule(container, "x")).toBeNull();
    expect(rule(container, "y")).toBeNull();
  });

  it("reads the cursor token with a fallback", () => {
    const { container } = renderInBounds(() => <Crosshair x={5} />);
    expect(rule(container, "x")?.getAttribute("stroke")).toBe(
      "var(--sp-color-cursor, currentColor)",
    );
  });

  it("is hidden from assistive tech — the announcer carries the value", () => {
    const { container } = renderInBounds(() => <Crosshair x={5} />);
    expect(
      container.querySelector("[data-silkplot-crosshair]")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("adds no transition, so there is no motion to suppress", () => {
    const { container } = renderInBounds(() => <Crosshair x={5} />);
    const el = rule(container, "x") as SVGElement;
    const style = getComputedStyle(el);
    // A cursor tracking a pointer is the pointer's motion, not ours. We add no
    // easing on top, so `prefers-reduced-motion` has nothing to turn off.
    expect(style.transitionDuration === "" || style.transitionDuration === "0s").toBe(true);
  });
});

/** TooltipAnchor needs a real container, so these mount a ChartRoot. */
function renderTooltip(node: () => JSX.Element) {
  return render(() => (
    <ChartRoot width={W} height={H}>
      {node()}
    </ChartRoot>
  ));
}

const tip = (c: HTMLElement) => c.querySelector("[data-silkplot-tooltip]") as HTMLElement;

describe("TooltipAnchor", () => {
  it("converts inner coordinates to container space by adding the margins", () => {
    const { container } = renderTooltip(() => (
      <TooltipAnchor x={100} y={100}>
        x
      </TooltipAnchor>
    ));
    const el = tip(container);
    // The content is CENTRED on the anchor, so the conversion shows up in the
    // element's centre, not its left edge. Asserting `left` directly would be
    // asserting the width of the letter "x".
    const centre = Number.parseFloat(el.style.left) + el.getBoundingClientRect().width / 2;
    expect(centre).toBeCloseTo(DEFAULT_MARGINS.left + 100, 0);
  });

  it("does not swallow the pointer events that positioned it", () => {
    const { container } = renderTooltip(() => (
      <TooltipAnchor x={10} y={10}>
        x
      </TooltipAnchor>
    ));
    expect(tip(container).style.pointerEvents).toBe("none");
  });

  it("is absolutely positioned, anchoring to ChartRoot's relative container", () => {
    const { container } = renderTooltip(() => (
      <TooltipAnchor x={10} y={10}>
        x
      </TooltipAnchor>
    ));
    expect(tip(container).style.position).toBe("absolute");
  });

  it("clamps to the container rather than running off the right edge", () => {
    const { container } = renderTooltip(() => (
      <TooltipAnchor x={BOUNDS.innerWidth + 500} y={10}>
        x
      </TooltipAnchor>
    ));
    expect(Number.parseFloat(tip(container).style.left)).toBeLessThanOrEqual(W);
  });

  it("clamps rather than running off the left edge", () => {
    const { container } = renderTooltip(() => (
      <TooltipAnchor x={-500} y={10}>
        x
      </TooltipAnchor>
    ));
    expect(Number.parseFloat(tip(container).style.left)).toBeGreaterThanOrEqual(0);
  });

  it("is hidden from assistive tech — it duplicates the announcement", () => {
    const { container } = renderTooltip(() => (
      <TooltipAnchor x={10} y={10}>
        x
      </TooltipAnchor>
    ));
    expect(tip(container).getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the caller's content untouched", () => {
    const { container } = renderTooltip(() => (
      <TooltipAnchor x={10} y={10}>
        <strong>42 units</strong>
      </TooltipAnchor>
    ));
    expect(tip(container).querySelector("strong")?.textContent).toBe("42 units");
  });
});

describe("ChartAnnouncer", () => {
  it("is a polite live region, so a hover does not interrupt the reader", () => {
    const { container } = render(() => <ChartAnnouncer message="Mar 4, 42 units" />);
    const el = container.querySelector("[data-silkplot-announcer]");
    expect(el?.getAttribute("aria-live")).toBe("polite");
    expect(el?.getAttribute("role")).toBe("status");
  });

  it("announces the message", () => {
    const { container } = render(() => <ChartAnnouncer message="Mar 4, 42 units" />);
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toBe(
      "Mar 4, 42 units",
    );
  });

  it("stays in the accessibility tree — hidden visually, not removed", () => {
    const { container } = render(() => <ChartAnnouncer message="x" />);
    const el = container.querySelector("[data-silkplot-announcer]") as HTMLElement;
    const style = getComputedStyle(el);
    // display:none or visibility:hidden would look identical in the DOM and be
    // silent to a reader. That is the failure this guards.
    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
    expect(el.getAttribute("aria-hidden")).toBeNull();
  });

  it("announces nothing when there is no active point", () => {
    const { container } = render(() => <ChartAnnouncer />);
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toBe("");
  });

  it("updates when the active datum changes", async () => {
    // Not synchronously: ADR-0005 §4 requires the region to be throttled, so a
    // second message inside the window is coalesced and lands when the window
    // closes. The full throttling contract — leading edge, coalescing, the
    // trailing guarantee, de-duplication, immediate clear — is proven in
    // `announcer.test.tsx`; this only holds the change to the value.
    const [msg, setMsg] = createSignal("first");
    const { container } = render(() => <ChartAnnouncer message={msg()} throttleMs={20} />);
    setMsg("second");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(container.querySelector("[data-silkplot-announcer]")?.textContent).toBe(
      "second",
    );
  });
});

describe("the pair agrees", () => {
  it("puts the tooltip on the same pixel the cursor rules cross", () => {
    const X = 120;
    const Y = 80;
    const { container } = render(() => (
      <ChartRoot width={W} height={H}>
        <SvgLayer>
          <Crosshair x={X} y={Y} />
        </SvgLayer>
        <TooltipAnchor x={X} y={Y}>
          x
        </TooltipAnchor>
      </ChartRoot>
    ));

    // The crosshair draws in inner space, inside a <g> translated by the
    // margins. The tooltip lives in container space and adds them itself. Both
    // must describe the same point on screen — compared at the tooltip's
    // centre, since that is what sits over the point.
    const el = tip(container);
    const crosshairX = num(rule(container, "x"), "x1");
    const tooltipCentre =
      Number.parseFloat(el.style.left) + el.getBoundingClientRect().width / 2;
    expect(tooltipCentre).toBeCloseTo(DEFAULT_MARGINS.left + crosshairX, 0);
  });
});

describe("a pointer surfaces the nearest datum", () => {
  // The resolution is the caller's, per the ADR. This is the reference
  // composition in miniature: resolve with an index, feed both primitives.
  const data = [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 10 },
  ];

  const build = () => {
    const xs = linearScale({ domain: [0, 10], range: [0, BOUNDS.innerWidth] });
    const ys = linearScale({ domain: [0, 10], range: [BOUNDS.innerHeight, 0] });
    const index = createHitIndex(data, {
      x: (d) => xs(d.x),
      y: (d) => ys(d.y),
    });
    return { xs, ys, index };
  };

  it("resolves a point near the last datum to the last datum", () => {
    const { xs, ys, index } = build();
    const i = index.nearest(xs(9.6), ys(9.6));
    expect(i).toBe(2);
  });

  it("resolves a point near the middle datum to the middle datum", () => {
    const { xs, ys, index } = build();
    const i = index.nearest(xs(4.7), ys(4.7));
    expect(i).toBe(1);
  });

  it("drives the cursor to the resolved datum's own position, not the pointer's", () => {
    const { xs, ys, index } = build();
    const [active, setActive] = createSignal<number | undefined>(undefined);

    const { container } = render(() => (
      <ChartRoot width={W} height={H}>
        <SvgLayer>
          <Crosshair
            x={active() === undefined ? undefined : xs(data[active()!]!.x)}
            y={active() === undefined ? undefined : ys(data[active()!]!.y)}
          />
        </SvgLayer>
      </ChartRoot>
    ));

    expect(rule(container, "x")).toBeNull();

    // A pointer slightly off the middle point resolves to it, and the cursor
    // snaps to the DATUM's pixel — snapping is the resolution, not the cursor.
    setActive(index.nearest(xs(4.7), ys(4.7)));

    expect(num(rule(container, "x"), "x1")).toBeCloseTo(xs(5));
    expect(num(rule(container, "y"), "y1")).toBeCloseTo(ys(5));
  });
});
