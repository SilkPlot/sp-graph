import { describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { createResize } from "../src/index";

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

  it("seeds a real measurement from the target's content box on mount", async () => {
    // `createResize` must be called inside a rendered component: `onMount`
    // only runs within a reactive root, and `render()` provides that root.
    let api!: ReturnType<typeof createResize>;
    const Fixture = () => {
      api = createResize();
      return (
        <div
          ref={api.setTarget}
          style={{ width: "300px", height: "150px", "box-sizing": "content-box" }}
        />
      );
    };

    const { unmount } = render(() => <Fixture />);

    // The seed measurement happens synchronously in onMount, so it should
    // already be correct without needing to await the observer callback.
    expect(api.size()).toEqual({ width: 300, height: 150 });

    unmount();
  });

  it("updates the signal when the observed element is resized after mount", async () => {
    let api!: ReturnType<typeof createResize>;
    const Fixture = () => {
      api = createResize();
      return (
        <div
          ref={api.setTarget}
          style={{ width: "300px", height: "150px", "box-sizing": "content-box" }}
        />
      );
    };

    const { container, unmount } = render(() => <Fixture />);

    await vi.waitFor(() => expect(api.size()).toEqual({ width: 300, height: 150 }));

    const el = container.firstElementChild as HTMLElement;
    el.style.width = "500px";
    el.style.height = "220px";

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
    let api!: ReturnType<typeof createResize>;
    const Fixture = () => {
      api = createResize();
      return (
        <div
          ref={api.setTarget}
          style={{ width: "300px", height: "150px", "box-sizing": "content-box" }}
        />
      );
    };

    const { container, unmount } = render(() => <Fixture />);

    await vi.waitFor(() => expect(api.size()).toEqual({ width: 300, height: 150 }));

    const el = container.firstElementChild as HTMLElement;

    unmount();

    // Detached from the document, but still a live element we can mutate.
    expect(() => {
      el.style.width = "999px";
      el.style.height = "888px";
    }).not.toThrow();

    // Give any (incorrectly) still-connected observer a chance to fire, then
    // confirm the signal never picked up the post-unmount change.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(api.size()).toEqual({ width: 300, height: 150 });
  });
});
