/**
 * The single-entry keyboard composite, per ADR-0005 §3.
 *
 * The model this file holds the code to is the one that overturned the
 * library's earlier assumption: a roving `tabindex` does NOT create one tab stop
 * per mark. Tab enters the chart once, arrows/Home/End/Page move inside it, Tab
 * and Shift+Tab always exit, Escape clears.
 *
 * Two properties are asserted harder than the rest because they are the ones a
 * chart can silently lose:
 *
 *   - **Navigation is never trapped.** Tab is not a key the composite handles
 *     well; it is a key the composite never touches. The test tabs THROUGH the
 *     surface, from a control before it to a control after it, in both
 *     directions, rather than checking that some handler chose not to intercept.
 *   - **There is one active-datum state.** A pointer resolution and a keyboard
 *     step are driven at the same target and asserted to produce the same index
 *     in the same object — not two values that happen to agree.
 *
 * Real browser, not jsdom: focus, `:focus-visible`, tab order and key dispatch
 * are all browser behaviour, and a fake DOM would let every one of them pass
 * while being wrong.
 */
import { describe, expect, it } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { linearScale, createHitIndex } from "@silkplot/core";
import {
  ChartKeyboardSurface,
  createActiveDatum,
  createChartKeyboard,
  DEFAULT_PAGE_SIZE,
  type ActiveDatum,
} from "../src/index";

/** Drive `createActiveDatum` outside a component, with a disposable root. */
function withActive<T>(count: number, body: (active: ActiveDatum) => T): T {
  return createRoot((dispose) => {
    const active = createActiveDatum({ count: () => count });
    try {
      return body(active);
    } finally {
      dispose();
    }
  });
}

describe("createActiveDatum — the one state both inputs write", () => {
  it("starts with nothing active", () => {
    withActive(5, (a) => expect(a.index()).toBeUndefined());
  });

  it("takes a direct index from the pointer path", () => {
    withActive(5, (a) => {
      a.set(3);
      expect(a.index()).toBe(3);
    });
  });

  it("clears rather than clamping when the pointer resolved nothing", () => {
    // `createHitIndex.nearest` returns -1 for a miss. Clamping that to 0 would
    // invent a selection the user never made.
    withActive(5, (a) => {
      a.set(2);
      a.set(-1);
      expect(a.index()).toBeUndefined();
    });
  });

  it("steps forward from no selection to the first point", () => {
    withActive(5, (a) => {
      a.step(1);
      expect(a.index()).toBe(0);
    });
  });

  it("steps backward from no selection to the last point", () => {
    withActive(5, (a) => {
      a.step(-1);
      expect(a.index()).toBe(4);
    });
  });

  it("clamps at the last point rather than wrapping to the first", () => {
    withActive(3, (a) => {
      a.toLast();
      a.step(1);
      a.step(1);
      expect(a.index()).toBe(2);
    });
  });

  it("clamps at the first point rather than wrapping to the last", () => {
    withActive(3, (a) => {
      a.toFirst();
      a.step(-1);
      expect(a.index()).toBe(0);
    });
  });

  it("does nothing at all on empty data", () => {
    withActive(0, (a) => {
      a.step(1);
      a.toFirst();
      a.toLast();
      a.set(0);
      expect(a.index()).toBeUndefined();
      expect(a.count()).toBe(0);
    });
  });

  it("re-clamps the active index when the data shrinks under it", () => {
    // The rapid-update case: a selection held while the series is replaced by a
    // shorter one must not point past the end. Every reader — cursor, option
    // label, announcement — indexes through this accessor, so one clamp covers
    // all of them.
    createRoot((dispose) => {
      const [count, setCount] = createSignal(10);
      const active = createActiveDatum({ count });
      active.set(9);
      expect(active.index()).toBe(9);
      setCount(3);
      expect(active.index()).toBe(2);
      setCount(0);
      expect(active.index()).toBeUndefined();
      dispose();
    });
  });

  it("defaults the page step to the documented engineering policy", () => {
    withActive(100, (a) => {
      expect(a.pageSize()).toBe(DEFAULT_PAGE_SIZE);
      a.toFirst();
      a.step(a.pageSize());
      expect(a.index()).toBe(DEFAULT_PAGE_SIZE);
    });
  });
});

/** Render the composite between two ordinary buttons, so tab order is testable. */
function renderSurface(options: { count?: number; label?: string } = {}) {
  const count = options.count ?? 5;
  const result = render(() => {
    const active = createActiveDatum({ count: () => count });
    const keyboard = createChartKeyboard({ active });
    return (
      <>
        <button type="button" data-testid="before">
          before
        </button>
        {/*
          `position: relative` on the wrapper, because the surface is absolutely
          positioned — without a containing block it escapes to the viewport and
          the buttons around it are no longer where the tab order says they are.
        */}
        <div style={{ position: "relative", width: "200px", height: "100px" }}>
          <ChartKeyboardSurface
            keyboard={keyboard}
            optionLabel={(i) => `Bookings, point ${i + 1}, ${i * 10} appointments`}
            label={options.label ?? "Sample series"}
          />
        </div>
        <button type="button" data-testid="after">
          after
        </button>
      </>
    );
  });
  const surface = result.container.querySelector<HTMLElement>(
    "[data-silkplot-keyboard-surface]",
  );
  if (!surface) throw new Error("keyboard surface not rendered");
  return { ...result, surface };
}

const option = (surface: HTMLElement) => surface.querySelector('[role="option"]');

describe("the composite's ARIA shape", () => {
  it("is a listbox, not role=application", () => {
    // ADR-0005 §3 rejects `role="application"` as a default: it competes with
    // the screen reader's own browse-mode arrow keys and a proper widget role
    // already performs the mode switch.
    const { surface } = renderSurface();
    expect(surface.getAttribute("role")).toBe("listbox");
    expect(surface.getAttribute("role")).not.toBe("application");
  });

  it("is exactly ONE tab stop", () => {
    const { container } = renderSurface({ count: 500 });
    const stops = container.querySelectorAll('[tabindex="0"], [tabindex="-1"]');
    // One surface, however many points. The rejected model would have produced
    // 500 here.
    expect(stops.length).toBe(1);
  });

  it("exposes the active point as a real option element", async () => {
    const { surface } = renderSurface();
    expect(option(surface)).toBeNull();

    surface.focus();
    await userEvent.keyboard("{ArrowRight}");

    const opt = option(surface);
    expect(opt?.textContent).toBe("Bookings, point 1, 0 appointments");
    expect(opt?.getAttribute("aria-selected")).toBe("true");
    // The collection is described, not rendered: one option, honest about the
    // set it belongs to.
    expect(opt?.getAttribute("aria-setsize")).toBe("5");
    expect(opt?.getAttribute("aria-posinset")).toBe("1");
    expect(surface.getAttribute("aria-activedescendant")).toBe(opt?.id);
  });

  it("drops aria-activedescendant when a live region carries the step", () => {
    const { container } = render(() => {
      const active = createActiveDatum({ count: () => 3 });
      const keyboard = createChartKeyboard({ active });
      active.set(1);
      return (
        <ChartKeyboardSurface
          keyboard={keyboard}
          optionLabel={(i) => `point ${i}`}
          label="x"
          activeDescendant={false}
        />
      );
    });
    const surface = container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]")!;
    // The option stays — it is the parallel semantic DOM layer, not merely an
    // announcement mechanism — but the reader is not sent to it, so the live
    // region is the only thing that speaks.
    expect(option(surface)).not.toBeNull();
    expect(surface.getAttribute("aria-activedescendant")).toBeNull();
  });

  it("carries the theme's focus class by default", () => {
    const { surface } = renderSurface();
    expect(surface.classList.contains("sp-focusable")).toBe(true);
  });
});

describe("entering, exploring, and leaving", () => {
  it("is reached by a single Tab and stepped with the arrow keys", async () => {
    const { container, surface } = renderSurface();
    container.querySelector<HTMLElement>('[data-testid="before"]')!.focus();

    await userEvent.tab();
    expect(document.activeElement).toBe(surface);

    await userEvent.keyboard("{ArrowRight}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("1");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("3");
    await userEvent.keyboard("{ArrowLeft}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("2");
  });

  it("accepts the vertical arrows too, so the axis of the chart does not matter", async () => {
    const { surface } = renderSurface();
    surface.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("2");
    await userEvent.keyboard("{ArrowUp}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("1");
  });

  it("jumps to the ends with Home and End", async () => {
    const { surface } = renderSurface();
    surface.focus();
    await userEvent.keyboard("{End}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("5");
    await userEvent.keyboard("{Home}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("1");
  });

  it("moves a page at a time with Page Up and Page Down", async () => {
    const { surface } = renderSurface({ count: 50 });
    surface.focus();
    await userEvent.keyboard("{Home}{PageDown}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe(String(1 + DEFAULT_PAGE_SIZE));
    await userEvent.keyboard("{PageUp}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("1");
  });

  it("clears the selection with Escape without moving focus", async () => {
    const { surface } = renderSurface();
    surface.focus();
    await userEvent.keyboard("{End}");
    expect(option(surface)).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    expect(option(surface)).toBeNull();
    expect(surface.getAttribute("aria-activedescendant")).toBeNull();
    // Escape clears the SELECTION. It is not the way out — that is Tab, and
    // focus must not have moved.
    expect(document.activeElement).toBe(surface);
  });

  it("stops at the last point rather than wrapping round to the first", async () => {
    const { surface } = renderSurface({ count: 3 });
    surface.focus();
    await userEvent.keyboard("{End}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("3");
  });

  it("stops at the first point rather than wrapping round to the last", async () => {
    const { surface } = renderSurface({ count: 3 });
    surface.focus();
    await userEvent.keyboard("{Home}{ArrowLeft}{ArrowLeft}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("1");
  });

  it("never traps: Tab leaves forward and Shift+Tab leaves backward", async () => {
    // The failure this guards is the one `role="application"` invites — a
    // surface that swallows keys until the user is stuck inside it. Asserted by
    // actually tabbing out in both directions, with a selection active so the
    // composite is in its most "engaged" state.
    const { container, surface } = renderSurface();
    surface.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");

    await userEvent.tab();
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="after"]'),
    );

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(surface);

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="before"]'),
    );
  });

  it("leaves Escape to the page when there is nothing to cancel", () => {
    // A chart with no selection must not swallow the Escape that closes the
    // dialog it sits in.
    createRoot((dispose) => {
      const active = createActiveDatum({ count: () => 5 });
      const kb = createChartKeyboard({ active });
      const bare = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      expect(kb.onKeyDown(bare)).toBe(false);
      expect(bare.defaultPrevented).toBe(false);

      active.set(2);
      const withSelection = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      expect(kb.onKeyDown(withSelection)).toBe(true);
      expect(active.index()).toBeUndefined();
      dispose();
    });
  });

  it("prevents the default scroll on the keys it claims, and only those", () => {
    createRoot((dispose) => {
      const active = createActiveDatum({ count: () => 5 });
      const kb = createChartKeyboard({ active });

      for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "PageUp", "PageDown"]) {
        const e = new KeyboardEvent("keydown", { key, cancelable: true });
        expect(kb.onKeyDown(e), `${key} was not claimed`).toBe(true);
        expect(e.defaultPrevented, `${key} did not prevent the page scroll`).toBe(true);
      }

      for (const key of ["Tab", "a", "Enter", " "]) {
        const e = new KeyboardEvent("keydown", { key, cancelable: true });
        expect(kb.onKeyDown(e), `${key} was claimed`).toBe(false);
        expect(e.defaultPrevented, `${key} was prevented`).toBe(false);
      }
      dispose();
    });
  });

  it("ignores a modified arrow, which belongs to the browser or the reader", () => {
    createRoot((dispose) => {
      const active = createActiveDatum({ count: () => 5 });
      const kb = createChartKeyboard({ active });
      for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
        const e = new KeyboardEvent("keydown", {
          key: "ArrowRight",
          cancelable: true,
          [mod]: true,
        });
        expect(kb.onKeyDown(e), `${mod}+ArrowRight was claimed`).toBe(false);
      }
      expect(active.index()).toBeUndefined();
      dispose();
    });
  });
});

describe("empty data", () => {
  it("is still focusable and still leaves, announcing no point", async () => {
    // A chart that is briefly empty — the first render before data arrives —
    // must not throw, must not become a dead tab stop that traps, and must not
    // claim to have a point.
    const { container, surface } = renderSurface({ count: 0 });
    surface.focus();
    await userEvent.keyboard("{ArrowRight}{End}{Home}{PageDown}{Escape}");

    expect(option(surface)).toBeNull();
    expect(surface.getAttribute("aria-activedescendant")).toBeNull();

    await userEvent.tab();
    expect(document.activeElement).toBe(container.querySelector('[data-testid="after"]'));
  });
});

describe("focus loss and focus continuity", () => {
  it("keeps the active point across leaving and re-entering the chart", async () => {
    // Losing focus is not the same as clearing a selection. A user who tabs out
    // to read something and tabs back should resume where they were rather than
    // starting over — Escape is the way to clear, and it is the only one.
    const { container, surface } = renderSurface();
    surface.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("3");

    container.querySelector<HTMLElement>('[data-testid="after"]')!.focus();
    expect(document.activeElement).not.toBe(surface);
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("3");

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(surface);
    await userEvent.keyboard("{ArrowRight}");
    expect(option(surface)?.getAttribute("aria-posinset")).toBe("4");
  });
});

describe("pointer and keyboard resolve the same datum", () => {
  // The acceptance criterion this whole arrangement exists for. ADR-0002 §4:
  // "Keyboard and pointer write the same state. Not a parallel path — the same
  // one. Otherwise they drift, and only one of them gets tested."
  const data = [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 10 },
  ];
  const xs = linearScale({ domain: [0, 10], range: [0, 300] });
  const ys = linearScale({ domain: [0, 10], range: [200, 0] });

  it("lands on the same index from a pointer pixel and from arrow keys", () => {
    createRoot((dispose) => {
      const active = createActiveDatum({ count: () => data.length });
      const kb = createChartKeyboard({ active });
      const index = createHitIndex(data, { x: (d) => xs(d.x), y: (d) => ys(d.y) });

      // Pointer: a pixel slightly off the middle datum.
      active.set(index.nearest(xs(4.7), ys(4.7)));
      const fromPointer = active.index();
      expect(fromPointer).toBe(1);

      // Keyboard: Home, then one step forward, on the SAME state object.
      active.clear();
      kb.onKeyDown(new KeyboardEvent("keydown", { key: "Home", cancelable: true }));
      kb.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
      const fromKeyboard = active.index();

      expect(fromKeyboard).toBe(fromPointer);
      dispose();
    });
  });

  it("lets the keyboard continue from wherever the pointer left the selection", () => {
    // The proof that it is one state and not two agreeing ones: if the keyboard
    // kept its own index, stepping after a pointer move would jump back to
    // wherever the keyboard had been.
    createRoot((dispose) => {
      const active = createActiveDatum({ count: () => data.length });
      const kb = createChartKeyboard({ active });
      const index = createHitIndex(data, { x: (d) => xs(d.x), y: (d) => ys(d.y) });

      active.set(index.nearest(xs(9.6), ys(9.6)));
      expect(active.index()).toBe(2);

      kb.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }));
      expect(active.index()).toBe(1);
      dispose();
    });
  });
});
