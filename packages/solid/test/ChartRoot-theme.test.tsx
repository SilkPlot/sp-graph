/**
 * ChartRoot binds its box to the default theme tokens (ADR-0001).
 *
 * A transparent, uncoloured container lets the user-agent colour leak into
 * axis labels (`currentColor`) and the canvas bitmap. The tokens are the
 * product default; the fallbacks are the light `:root` values.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { ChartRoot } from "../src/index";

describe("ChartRoot theme tokens", () => {
  it("sets color and background to the default --sp tokens", () => {
    const { container } = render(() => <ChartRoot width={120} height={80} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.color).toBe("var(--sp-color-text, #16181d)");
    expect(root.style.background).toBe("var(--sp-color-surface, #ffffff)");
  });
});
