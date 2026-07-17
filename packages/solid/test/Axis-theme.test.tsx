/**
 * Axis consumes its theme tokens — proven on computed styles.
 *
 * Axis used to hardcode `font-size="11"` and `stroke="currentColor"
 * stroke-opacity="0.4"`, reading neither `--sp-font-sm` nor `--sp-color-axis`.
 * A token the primitive ignores is a token the contract lies about. These tests
 * override the tokens on an ancestor and assert the RENDERED tick font-size and
 * line stroke follow — the mutation-provable evidence that the wiring is real,
 * not a var() string that never resolves.
 */
import { describe, expect, it } from "vitest";
import type { JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  Axis,
  ChartBoundsContext,
  resolveBounds,
  DEFAULT_MARGINS,
} from "../src/index";
import { linearScale } from "@silkplot/core";

const BOUNDS = resolveBounds(400, 300, DEFAULT_MARGINS);
const linear = linearScale({ domain: [0, 100], range: [0, BOUNDS.innerWidth] });

/** Mount an Axis under a container carrying arbitrary custom-property overrides. */
function mountThemed(style: JSX.CSSProperties) {
  return render(() => (
    <div style={style}>
      {/* test harness element, never shown to a user */}
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: test harness element */}
      <svg>
        <ChartBoundsContext.Provider value={() => BOUNDS}>
          <Axis scale={linear} />
        </ChartBoundsContext.Provider>
      </svg>
    </div>
  ));
}

const firstText = (c: HTMLElement): SVGTextElement => {
  const t = c.querySelector("[data-silkplot-axis] g text");
  expect(t, "expected at least one tick <text>").not.toBeNull();
  return t as SVGTextElement;
};
const firstTickLine = (c: HTMLElement): SVGLineElement => {
  const l = c.querySelector("[data-silkplot-axis] g line");
  expect(l, "expected at least one tick <line>").not.toBeNull();
  return l as SVGLineElement;
};

describe("Axis tick font-size follows --sp-font-sm", () => {
  it("resolves to the overridden token value", () => {
    const { container } = mountThemed({ "--sp-font-sm": "22px" });
    expect(getComputedStyle(firstText(container)).fontSize).toBe("22px");
  });

  it("falls back to 11px when no token stylesheet is loaded", () => {
    // No override and no theme sheet: the var() fallback is what keeps the axis
    // legible. A resolved 11px (not the 16px default) proves the fallback path.
    const { container } = mountThemed({});
    expect(getComputedStyle(firstText(container)).fontSize).toBe("11px");
  });
});

describe("Axis line/ticks follow --sp-color-axis at full strength", () => {
  it("resolves the tick stroke to the axis token colour", () => {
    const { container } = mountThemed({ "--sp-color-axis": "rgb(10, 20, 30)" });
    expect(getComputedStyle(firstTickLine(container)).stroke).toBe("rgb(10, 20, 30)");
  });

  it("no longer double-dims with stroke-opacity 0.4", () => {
    // The old code applied 0.4 on top of an already-pre-muted token — two places
    // deciding one colour. The token now owns the muting; opacity is gone.
    const { container } = mountThemed({ "--sp-color-axis": "rgb(10, 20, 30)" });
    const line = firstTickLine(container);
    expect(line.getAttribute("stroke-opacity")).toBeNull();
    expect(getComputedStyle(line).strokeOpacity).toBe("1");
  });
});
