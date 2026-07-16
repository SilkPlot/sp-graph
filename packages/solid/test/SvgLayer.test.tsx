/**
 * SvgLayer sizes an <svg> to the chart bounds and translates an inner <g> by
 * the margins. These tests cover its documented accessibility contract
 * (`role` default/override, `title`/`desc` mapping to <title>/<desc>) plus
 * the sizing and children-placement behaviour.
 */
import { describe, expect, it } from "vitest";
import type { Accessor, JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  SvgLayer,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "../src/index";
import type { ChartBounds } from "../src/index";

const BOUNDS: ChartBounds = resolveBounds(400, 300, DEFAULT_MARGINS);

/** Mount children under a fixed (non-measuring) bounds context — SvgLayer
 * requires one and reads it synchronously on render. */
function mount(
  children: () => JSX.Element,
  boundsAccessor: Accessor<ChartBounds> = () => BOUNDS,
) {
  return render(() => (
    <ChartBoundsContext.Provider value={boundsAccessor}>
      {children()}
    </ChartBoundsContext.Provider>
  ));
}

function getSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  expect(svg, "expected an <svg> to be rendered").not.toBeNull();
  return svg as SVGSVGElement;
}

describe("SvgLayer — sizing", () => {
  it("sizes the <svg> to the chart bounds (width, height, viewBox)", () => {
    const { container } = mount(() => <SvgLayer />);
    const svg = getSvg(container);
    expect(svg.getAttribute("width")).toBe(String(BOUNDS.width));
    expect(svg.getAttribute("height")).toBe(String(BOUNDS.height));
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${BOUNDS.width} ${BOUNDS.height}`);
  });

  it("wraps children in an inner <g> translated by the margins", () => {
    const { container } = mount(() => (
      <SvgLayer>
        <circle class="test-child" r={3} />
      </SvgLayer>
    ));
    const svg = getSvg(container);
    const g = svg.querySelector(":scope > g");
    expect(g, "expected an inner <g> translated by the margins").not.toBeNull();
    expect(g?.getAttribute("transform")).toBe(
      `translate(${BOUNDS.margins.left},${BOUNDS.margins.top})`,
    );
    expect(g?.querySelector("circle.test-child")).not.toBeNull();
  });

  it("forwards the class prop to the <svg> element", () => {
    const { container } = mount(() => <SvgLayer class="my-chart" />);
    expect(getSvg(container).getAttribute("class")).toBe("my-chart");
  });
});

describe("SvgLayer — accessibility contract", () => {
  it('defaults role to "img" when omitted', () => {
    const { container } = mount(() => <SvgLayer />);
    expect(getSvg(container).getAttribute("role")).toBe("img");
  });

  it("applies an explicit role instead of the default", () => {
    const { container } = mount(() => <SvgLayer role="group" />);
    expect(getSvg(container).getAttribute("role")).toBe("group");
  });

  it("renders title as a <title> element with the given text (the accessible name)", () => {
    const { container } = mount(() => <SvgLayer title="Monthly revenue" />);
    const title = getSvg(container).querySelector("title");
    expect(title).not.toBeNull();
    expect(title?.textContent).toBe("Monthly revenue");
  });

  it("renders desc as a <desc> element with the given text (the accessible description)", () => {
    const { container } = mount(() => (
      <SvgLayer desc="Revenue per month from January to December" />
    ));
    const desc = getSvg(container).querySelector("desc");
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toBe("Revenue per month from January to December");
  });

  it("emits no <title> element when title is omitted (no empty accessible name)", () => {
    const { container } = mount(() => <SvgLayer />);
    expect(getSvg(container).querySelector("title")).toBeNull();
  });

  it("emits no <desc> element when desc is omitted", () => {
    const { container } = mount(() => <SvgLayer />);
    expect(getSvg(container).querySelector("desc")).toBeNull();
  });

  it("renders title and desc together, each as its own element", () => {
    const { container } = mount(() => (
      <SvgLayer title="Monthly revenue" desc="Revenue per month" />
    ));
    const svg = getSvg(container);
    expect(svg.querySelector("title")?.textContent).toBe("Monthly revenue");
    expect(svg.querySelector("desc")?.textContent).toBe("Revenue per month");
  });
});
