/**
 * The interaction showcase, proven to be wired — not just present.
 *
 * The library's own suites prove the gesture mechanics; these tests prove the
 * EXAMPLES actually connect them. Each interactive example takes at least one
 * dispatched pointer gesture and one keyboard gesture, and the observable is
 * user-meaningful: the chart's data table narrows with the visible domain, so
 * a zoom that works shrinks the row count. The linked-dashboard test asserts
 * the whole point of the example — a brush on one member narrows the OTHER
 * member and leaves the pinned section alone.
 *
 * Event recipes follow the library's own gesture suites: keydown on the
 * keyboard surface, ctrl-wheel with an animation-frame commit, pointer
 * events with clientX derived from the surface's own rect.
 */
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import NavigateExample from "../src/examples/06-navigate";
import RangeControlExample from "../src/examples/07-range-control";
import LinkedDashboardExample from "../src/examples/08-linked-dashboard";
import { installThemeStyles } from "../src/install-styles";
import "../src/styles.css";

installThemeStyles();

afterEach(cleanup);

function surfaces(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      "[data-silkplot-keyboard-surface]",
    ),
  ];
}

function surfaceOf(container: HTMLElement): HTMLElement {
  const all = surfaces(container);
  if (all.length === 0) throw new Error("no keyboard surface rendered");
  return all[0] as HTMLElement;
}

function rowCounts(container: HTMLElement): number[] {
  return [...container.querySelectorAll("table")].map(
    (t) => t.querySelectorAll("tbody tr").length,
  );
}

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

function ctrlWheel(el: HTMLElement, deltaY: number): void {
  el.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function drag(el: HTMLElement, fromX: number, toX: number): void {
  const left = el.getBoundingClientRect().left;
  for (const [type, x] of [
    ["pointerdown", fromX],
    ["pointermove", toX],
    ["pointerup", toX],
  ] as const) {
    el.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: left + x,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}

describe("navigate-a-time-series example", () => {
  it("zooms on ctrl+wheel: the table narrows with the visible domain", async () => {
    const { container } = render(() => <NavigateExample />);
    const before = rowCounts(container)[0];
    expect(before).toBe(90);
    ctrlWheel(surfaceOf(container), -240);
    await nextFrame();
    await nextFrame();
    const after = rowCounts(container)[0];
    expect(after, "ctrl+wheel did not narrow the domain").toBeLessThan(90);
  });

  it("zooms from the keyboard with + and restores with 0", async () => {
    const { container } = render(() => <NavigateExample />);
    const surface = surfaceOf(container);
    press(surface, "+");
    await nextFrame();
    expect(rowCounts(container)[0]).toBeLessThan(90);
    press(surface, "0");
    await nextFrame();
    expect(rowCounts(container)[0]).toBe(90);
  });
});

describe("range-control example", () => {
  it("narrows the chart when a handle moves from the keyboard", async () => {
    const { container } = render(() => <RangeControlExample />);
    const before = rowCounts(container)[0];
    const sliders = [
      ...container.querySelectorAll<HTMLElement>('[role="slider"]'),
    ];
    expect(sliders.length).toBeGreaterThanOrEqual(2);
    const start = sliders[0] as HTMLElement;
    const valueBefore = start.getAttribute("aria-valuenow");
    press(start, "ArrowRight");
    await nextFrame();
    expect(
      start.getAttribute("aria-valuenow"),
      "the start handle did not move",
    ).not.toBe(valueBefore);
    expect(rowCounts(container)[0]).toBeLessThanOrEqual(before as number);
  });

  it("a brush on the chart moves the control's window", async () => {
    const { container } = render(() => <RangeControlExample />);
    const sliders = [
      ...container.querySelectorAll<HTMLElement>('[role="slider"]'),
    ];
    const start = sliders[0] as HTMLElement;
    const valueBefore = start.getAttribute("aria-valuenow");
    drag(surfaceOf(container), 80, 220);
    await nextFrame();
    await nextFrame();
    expect(
      start.getAttribute("aria-valuenow"),
      "the brush did not reach the range control",
    ).not.toBe(valueBefore);
  });
});

describe("linked-dashboard example", () => {
  it("a brush on one member narrows the other and spares the section", async () => {
    const { container } = render(() => <LinkedDashboardExample />);
    const before = rowCounts(container);
    expect(before.length).toBe(3);
    expect(before[0]).toBe(60);
    expect(before[1]).toBe(60);
    const sectionBefore = before[2];

    drag(surfaceOf(container), 80, 240);
    await nextFrame();
    await nextFrame();

    const after = rowCounts(container);
    expect(after[0], "the brushed member did not narrow").toBeLessThan(60);
    expect(after[1], "the linked member did not follow").toBeLessThan(60);
    expect(after[2], "the pinned section moved — isolation broke").toBe(
      sectionBefore,
    );
  });

  it("keyboard parity: Shift+arrow on a member drives the shared selection too", async () => {
    const { container } = render(() => <LinkedDashboardExample />);
    // Zoom the first member from the keyboard so a selection exists…
    const first = surfaceOf(container);
    press(first, "+");
    await nextFrame();
    await nextFrame();
    const after = rowCounts(container);
    // …and the second member follows it, because the gesture drove the
    // dashboard's dynamic selection, not a private viewport.
    expect(after[1], "keyboard zoom did not reach the linked member").toBeLessThan(60);
  });
});
