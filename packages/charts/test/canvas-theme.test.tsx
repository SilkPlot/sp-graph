/**
 * Theme-revision subscription: Canvas only rereads `--sp-color-*` on paint.
 */
import { afterEach, describe, expect, it } from "vitest";
import { THEME_ATTR } from "@silkplot/theme";
import { subscribeThemeRevision } from "../src/canvas-theme";

describe("subscribeThemeRevision", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(THEME_ATTR);
    for (const el of document.body.querySelectorAll(`[${THEME_ATTR}]`)) {
      el.removeAttribute(THEME_ATTR);
    }
  });

  it("notifies when data-sp-theme changes on the root or a subtree, and unsubscribes", async () => {
    let n = 0;
    const stop = subscribeThemeRevision(() => {
      n += 1;
    });
    document.documentElement.setAttribute(THEME_ATTR, "dark");
    await expect.poll(() => n).toBeGreaterThan(0);
    const afterRoot = n;
    const island = document.createElement("div");
    document.body.appendChild(island);
    island.setAttribute(THEME_ATTR, "light");
    await expect.poll(() => n).toBeGreaterThan(afterRoot);
    stop();
    const frozen = n;
    document.documentElement.setAttribute(THEME_ATTR, "light");
    island.remove();
    await new Promise((r) => setTimeout(r, 30));
    expect(n).toBe(frozen);
  });

  it("notifies when prefers-color-scheme or prefers-contrast matchMedia fires change", () => {
    let n = 0;
    const stop = subscribeThemeRevision(() => {
      n += 1;
    });
    window.matchMedia("(prefers-color-scheme: dark)").dispatchEvent(new Event("change"));
    window.matchMedia("(prefers-contrast: more)").dispatchEvent(new Event("change"));
    expect(n).toBe(2);
    stop();
  });
});
