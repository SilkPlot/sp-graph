/**
 * Theme-revision subscription: Canvas only rereads `--sp-color-*` on paint.
 *
 * Chromium does not fire MediaQueryList listeners from `dispatchEvent`. The
 * matchMedia path is proven with CDP `Emulation.setEmulatedMedia`, the same
 * signal the site theme and `prefers-contrast: more` actually produce.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { THEME_ATTR } from "@silkplot/theme";
import { subscribeThemeRevision } from "../src/canvas-theme";

interface CdpLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}
const session = cdp() as unknown as CdpLike;

async function setMedia(
  scheme: "light" | "dark",
  contrast: "no-preference" | "more",
): Promise<void> {
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-contrast", value: contrast },
    ],
  });
}

describe("subscribeThemeRevision", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(THEME_ATTR);
    for (const el of document.body.querySelectorAll(`[${THEME_ATTR}]`)) {
      el.removeAttribute(THEME_ATTR);
    }
  });

  afterAll(async () => {
    await session.send("Emulation.setEmulatedMedia", { features: [] });
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
    await expect.poll(() => n).toBe(frozen);
  });

  it("notifies when prefers-color-scheme or prefers-contrast matchMedia fires change", async () => {
    await setMedia("light", "no-preference");
    let n = 0;
    const stop = subscribeThemeRevision(() => {
      n += 1;
    });
    await setMedia("dark", "no-preference");
    await expect.poll(() => n).toBeGreaterThan(0);
    const afterScheme = n;
    await setMedia("dark", "more");
    await expect.poll(() => n).toBeGreaterThan(afterScheme);
    stop();
  });
});
