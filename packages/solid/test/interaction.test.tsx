/**
 * The interaction surface per ADR-0002, where more than one piece is involved.
 *
 * `Crosshair` and `TooltipAnchor` are told a position and are proven on their
 * own in `Crosshair.test.tsx` and `TooltipAnchor.test.tsx`. What is left here is
 * what no single-primitive file can state:
 *
 *   - the cursor and the tooltip, given the SAME point, must land on the same
 *     pixel. Only the tooltip adds the margins; if both did, or neither, the
 *     tooltip would sit a margin away from the line it describes.
 *   - a simulated pointer move must surface the datum actually nearest, which
 *     is the whole feature and the one thing a position-only test cannot show.
 *
 * `ChartAnnouncer`'s live-region basics stay here too: they are the
 * accessibility channel of this same interaction, and the announcer's full
 * throttling contract has its own gated suite in `announcer.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { linearScale, createHitIndex } from "@silkplot/core";
import {
  Crosshair,
  TooltipAnchor,
  ChartAnnouncer,
  ChartRoot,
  SvgLayer,
  resolveBounds,
  DEFAULT_MARGINS,
} from "../src/index";

const W = 400;
const H = 300;
const BOUNDS = resolveBounds(W, H, DEFAULT_MARGINS);

const rule = (c: HTMLElement, axis: "x" | "y") =>
  c.querySelector(`[data-silkplot-crosshair-rule="${axis}"]`);
const num = (el: Element | null, attr: string) => Number(el?.getAttribute(attr));

const tip = (c: HTMLElement) => c.querySelector("[data-silkplot-tooltip]") as HTMLElement;

/** Where the tooltip's CENTRE sits — the content is centred on the anchor, not left-aligned to it. */
const tipCentre = (el: HTMLElement): number =>
  Number.parseFloat(el.style.left) + el.getBoundingClientRect().width / 2;

describe("ChartAnnouncer", () => {
  const live = (c: HTMLElement) =>
    c.querySelector("[data-silkplot-announcer]") as HTMLElement | null;

  it("is a polite live region, so a hover does not interrupt the reader", () => {
    const { container } = render(() => <ChartAnnouncer message="Mar 4, 42 units" />);
    const el = live(container);
    expect(el?.getAttribute("aria-live")).toBe("polite");
    expect(el?.getAttribute("role")).toBe("status");
  });

  it("announces the message", () => {
    const { container } = render(() => <ChartAnnouncer message="Mar 4, 42 units" />);
    expect(live(container)?.textContent).toBe("Mar 4, 42 units");
  });

  it("stays in the accessibility tree — hidden visually, not removed", () => {
    const { container } = render(() => <ChartAnnouncer message="x" />);
    const el = live(container) as HTMLElement;
    const style = getComputedStyle(el);
    // display:none or visibility:hidden would look identical in the DOM and be
    // silent to a reader. That is the failure this guards.
    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
    expect(el.getAttribute("aria-hidden")).toBeNull();
  });

  it("announces nothing when there is no active point", () => {
    const { container } = render(() => <ChartAnnouncer />);
    expect(live(container)?.textContent).toBe("");
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
    expect(live(container)?.textContent).toBe("second");
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
    const crosshairX = num(rule(container, "x"), "x1");
    expect(tipCentre(tip(container))).toBeCloseTo(DEFAULT_MARGINS.left + crosshairX, 0);
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
