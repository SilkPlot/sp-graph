import { describe, expect, it } from "vitest";
import { createEffect, createRoot, createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  resolveBounds,
  DEFAULT_MARGINS,
  useChartBounds,
  ChartBoundsContext,
} from "../src/index";
import type { ChartBounds } from "../src/index";

describe("DEFAULT_MARGINS", () => {
  it("matches the documented shape", () => {
    expect(DEFAULT_MARGINS).toEqual({ top: 8, right: 12, bottom: 24, left: 40 });
  });
});

describe("resolveBounds", () => {
  it("subtracts margins from width/height in the normal case", () => {
    const bounds = resolveBounds(400, 300, { top: 10, right: 20, bottom: 30, left: 40 });
    expect(bounds.innerWidth).toBe(400 - 40 - 20);
    expect(bounds.innerHeight).toBe(300 - 10 - 30);
  });

  it("echoes back width, height, and margins unchanged", () => {
    const margins = { top: 1, right: 2, bottom: 3, left: 4 };
    const bounds = resolveBounds(400, 300, margins);
    expect(bounds.width).toBe(400);
    expect(bounds.height).toBe(300);
    expect(bounds.margins).toBe(margins);
  });

  it("clamps innerWidth to 0 when horizontal margins exceed width", () => {
    const bounds = resolveBounds(50, 300, { top: 0, right: 20, bottom: 0, left: 40 });
    expect(bounds.innerWidth).toBe(0);
    expect(bounds.innerWidth).not.toBeLessThan(0);
  });

  it("clamps innerHeight to 0 when vertical margins exceed height", () => {
    const bounds = resolveBounds(300, 50, { top: 40, right: 0, bottom: 20, left: 0 });
    expect(bounds.innerHeight).toBe(0);
    expect(bounds.innerHeight).not.toBeLessThan(0);
  });

  it("clamps both dimensions to 0 when margins exceed both width and height", () => {
    const bounds = resolveBounds(10, 10, { top: 50, right: 50, bottom: 50, left: 50 });
    expect(bounds.innerWidth).toBe(0);
    expect(bounds.innerHeight).toBe(0);
  });

  it("handles zero width and height", () => {
    const bounds = resolveBounds(0, 0, DEFAULT_MARGINS);
    expect(bounds.innerWidth).toBe(0);
    expect(bounds.innerHeight).toBe(0);
  });

  it("produces exactly 0 (not clamped) when margins exactly equal the outer box", () => {
    // left(40) + right(12) = 52 = width; top(8) + bottom(24) = 32 = height.
    const bounds = resolveBounds(52, 32, { top: 8, right: 12, bottom: 24, left: 40 });
    expect(bounds.innerWidth).toBe(0);
    expect(bounds.innerHeight).toBe(0);
  });
});

describe("useChartBounds", () => {
  it("throws with a message naming the library and required parent when used outside a ChartRoot", () => {
    let caught: unknown;
    createRoot((dispose) => {
      try {
        useChartBounds();
      } catch (err) {
        caught = err;
      }
      dispose();
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("@silkplot/solid");
    expect((caught as Error).message).toContain("useChartBounds()");
    expect((caught as Error).message).toContain("<ChartRoot>");
  });

  it("returns the provided accessor and reads its value inside a Provider", () => {
    const fixedBounds: ChartBounds = {
      width: 100,
      height: 50,
      margins: DEFAULT_MARGINS,
      innerWidth: 48,
      innerHeight: 18,
    };

    let observed: ChartBounds | undefined;
    const { unmount } = render(() => {
      const Consumer = () => {
        const bounds = useChartBounds();
        observed = bounds();
        return null;
      };
      return (
        <ChartBoundsContext.Provider value={() => fixedBounds}>
          <Consumer />
        </ChartBoundsContext.Provider>
      );
    });

    expect(observed).toEqual(fixedBounds);
    unmount();
  });

  it("re-runs consumers when the underlying signal updates (accessor semantics)", () => {
    const initial: ChartBounds = {
      width: 100,
      height: 50,
      margins: DEFAULT_MARGINS,
      innerWidth: 48,
      innerHeight: 18,
    };
    const updated: ChartBounds = {
      width: 200,
      height: 100,
      margins: DEFAULT_MARGINS,
      innerWidth: 148,
      innerHeight: 68,
    };

    const [bounds, setBounds] = createSignal(initial);
    const seen: ChartBounds[] = [];

    const { unmount } = render(() => {
      const Consumer = () => {
        const ctx = useChartBounds();
        // createEffect (not a plain body read) is what re-runs when the
        // accessor's underlying signal changes.
        createEffect(() => {
          seen.push(ctx());
        });
        return null;
      };
      return (
        <ChartBoundsContext.Provider value={bounds}>
          <Consumer />
        </ChartBoundsContext.Provider>
      );
    });

    expect(seen).toEqual([initial]);
    setBounds(updated);
    expect(seen).toEqual([initial, updated]);
    unmount();
  });
});
