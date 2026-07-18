import { describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { createResize } from "../src/index";

/** content-box so the measured size is exactly the declared one, with no padding to subtract. */
const BOX = { width: "300px", height: "150px", "box-sizing": "content-box" } as const;
const SEEDED = { width: 300, height: 150 };

/**
 * Mount a sized box wired to `createResize`, and hand back its API.
 *
 * `createResize()` must be called inside a rendered component: `onMount` only
 * runs within a reactive root, and bare in a test body it silently reads back
 * `{ width: 0, height: 0 }`. `render()` provides that root — which is exactly
 * why this is a shared fixture rather than four hand-copied ones that could
 * each drift out of it.
 */
function renderBox(initial?: { width: number; height: number }) {
  let api!: ReturnType<typeof createResize>;
  const Fixture = () => {
    api = createResize(initial);
    return <div ref={api.setTarget} style={BOX} />;
  };
  const { container, unmount } = render(() => <Fixture />);
  return {
    api,
    unmount,
    el: () => container.firstElementChild as HTMLElement,
  };
}

describe("createResize", () => {
  it("defaults to { width: 0, height: 0 } when no initial size is given", () => {
    createRoot((dispose) => {
      const { size } = createResize();
      expect(size()).toEqual({ width: 0, height: 0 });
      dispose();
    });
  });

  it("respects a custom initial size before mount", () => {
    createRoot((dispose) => {
      const { size } = createResize({ width: 42, height: 24 });
      expect(size()).toEqual({ width: 42, height: 24 });
      dispose();
    });
  });

  it("seeds a real measurement from the target's content box on mount", () => {
    const { api, unmount } = renderBox();

    // The seed measurement happens synchronously in onMount, so it should
    // already be correct without needing to await the observer callback.
    expect(api.size()).toEqual(SEEDED);

    unmount();
  });

  it("updates the signal when the observed element is resized after mount", async () => {
    const { api, el, unmount } = renderBox();

    await vi.waitFor(() => expect(api.size()).toEqual(SEEDED));

    el().style.width = "500px";
    el().style.height = "220px";

    // ResizeObserver fires asynchronously; poll rather than assert immediately.
    await vi.waitFor(() => expect(api.size()).toEqual({ width: 500, height: 220 }));

    unmount();
  });

  it("stays at the initial size and does not throw when setTarget is never called", async () => {
    let api!: ReturnType<typeof createResize>;
    const Fixture = () => {
      api = createResize({ width: 7, height: 9 });
      return <div />;
    };

    const { unmount } = render(() => <Fixture />);

    // Give onMount a chance to run; with no target it should bail out cleanly.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.size()).toEqual({ width: 7, height: 9 });

    unmount();
  });

  it("disconnects the observer on cleanup so post-unmount resizes are not observed", async () => {
    const { api, el, unmount } = renderBox();

    await vi.waitFor(() => expect(api.size()).toEqual(SEEDED));

    const detached = el();

    unmount();

    // Detached from the document, but still a live element we can mutate.
    expect(() => {
      detached.style.width = "999px";
      detached.style.height = "888px";
    }).not.toThrow();

    // Give any (incorrectly) still-connected observer a chance to fire, then
    // confirm the signal never picked up the post-unmount change.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.size()).toEqual(SEEDED);
  });
});
