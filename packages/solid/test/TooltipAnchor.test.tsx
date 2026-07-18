/**
 * TooltipAnchor, per ADR-0002.
 *
 * The anchor is told a position in INNER coordinates and places itself in
 * container space, which is the one conversion it owns. That the cursor and the
 * tooltip land on the same pixel is a claim about the pair, not about this
 * primitive, and lives in `interaction.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import type { JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  TooltipAnchor,
  ChartRoot,
  resolveBounds,
  DEFAULT_MARGINS,
} from "../src/index";

const W = 400;
const H = 300;
const BOUNDS = resolveBounds(W, H, DEFAULT_MARGINS);

/** TooltipAnchor needs a real container, so these mount a ChartRoot. */
function renderTooltip(node: () => JSX.Element) {
  return render(() => (
    <ChartRoot width={W} height={H}>
      {node()}
    </ChartRoot>
  ));
}

const tip = (c: HTMLElement) => c.querySelector("[data-silkplot-tooltip]") as HTMLElement;

/**
 * Mount one anchor and return its element. The position is the argument because
 * the position is what several of these cases are about; the placeholder content
 * is not, so it defaults.
 */
const mountTip = (x: number, y: number, children: JSX.Element = "x"): HTMLElement => {
  const { container } = renderTooltip(() => (
    <TooltipAnchor x={x} y={y}>
      {children}
    </TooltipAnchor>
  ));
  return tip(container);
};

/** Where the tooltip's CENTRE sits — the content is centred on the anchor, not left-aligned to it. */
const tipCentre = (el: HTMLElement): number =>
  Number.parseFloat(el.style.left) + el.getBoundingClientRect().width / 2;

describe("TooltipAnchor", () => {
  it("converts inner coordinates to container space by adding the margins", () => {
    const el = mountTip(100, 100);
    // The content is CENTRED on the anchor, so the conversion shows up in the
    // element's centre, not its left edge. Asserting `left` directly would be
    // asserting the width of the letter "x".
    expect(tipCentre(el)).toBeCloseTo(DEFAULT_MARGINS.left + 100, 0);
  });

  it("does not swallow the pointer events that positioned it", () => {
    expect(mountTip(10, 10).style.pointerEvents).toBe("none");
  });

  it("is absolutely positioned, anchoring to ChartRoot's relative container", () => {
    expect(mountTip(10, 10).style.position).toBe("absolute");
  });

  it("clamps to the container rather than running off the right edge", () => {
    const left = Number.parseFloat(mountTip(BOUNDS.innerWidth + 500, 10).style.left);
    expect(left).toBeLessThanOrEqual(W);
  });

  it("clamps rather than running off the left edge", () => {
    const left = Number.parseFloat(mountTip(-500, 10).style.left);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("is hidden from assistive tech — it duplicates the announcement", () => {
    expect(mountTip(10, 10).getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the caller's content untouched", () => {
    const el = mountTip(10, 10, <strong>42 units</strong>);
    expect(el.querySelector("strong")?.textContent).toBe("42 units");
  });
});
