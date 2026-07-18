/**
 * Crosshair, per ADR-0002.
 *
 * The primitive is testable without a pointer, which is the point of the ADR:
 * it is told a position. So these give it a position and assert what renders.
 * Where the cursor and the tooltip have to AGREE about a point, and where a
 * simulated pointer has to resolve to the nearest datum, the case lives in
 * `interaction.test.tsx` — those are compositions, not this primitive.
 */
import { describe, expect, it } from "vitest";
import type { JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  Crosshair,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "../src/index";

const BOUNDS = resolveBounds(400, 300, DEFAULT_MARGINS);

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
