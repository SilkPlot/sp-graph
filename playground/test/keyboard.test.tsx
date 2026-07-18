/**
 * The reference composition's keyboard model, and the one claim this phase is
 * built around: **pointer and keyboard choose the same datum for the same
 * target.**
 *
 * That is asserted here rather than only on the primitives because this is the
 * only place in the repository where a real pointer path and a real keyboard
 * path meet over a rendered chart. ADR-0002 §1 puts resolution in a pointer
 * model precisely so the cursor and the tooltip cannot disagree about which
 * point is active, and §4 extends it: "Keyboard and pointer write the same
 * state. Not a parallel path — the same one. Otherwise they drift, and only one
 * of them gets tested."
 *
 * The proof is deliberately not "both produce index 7". It is: let the POINTER
 * resolve a datum and record everything that followed — the ordinal, the pixel
 * the cursor was drawn at, the sentence announced; then clear, drive the
 * KEYBOARD to that same ordinal from scratch, and require all three to be
 * identical. Two paths keeping separate state, or resolving through separate
 * code, would not reproduce a pixel to the last decimal by luck.
 *
 * The test does NOT compute a client coordinate and assert which datum it
 * resolves to. Converting a client coordinate into an inner one is the pointer
 * model's arithmetic, and ADR-0002 §1 makes that a separate concern with its own
 * phase; asserting it here would be testing hit-testing under the name of
 * shared state.
 *
 * Real browser, real events, real layout — a pointer position means nothing in
 * a fake DOM where every element measures zero.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { tokensToCss } from "@silkplot/theme";
import { App } from "../src/App";

let sheet: HTMLStyleElement;

beforeAll(() => {
  sheet = document.createElement("style");
  sheet.textContent = tokensToCss();
  document.head.appendChild(sheet);
});

afterAll(() => sheet.remove());

/** The reference composition's composite surface, by its own label. */
function referenceSurface(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    '[data-silkplot-keyboard-surface][aria-label^="Sample daily series."]',
  );
  if (!el) throw new Error("reference surface not found");
  return el;
}

/** Where the cursor is drawn, in inner coordinates, or undefined when it is not. */
function crosshairAt(container: HTMLElement, axis: "x" | "y"): number | undefined {
  const rule = container.querySelector(`[data-silkplot-crosshair-rule="${axis}"]`);
  if (!rule) return undefined;
  return Number(rule.getAttribute(axis === "x" ? "x1" : "y1"));
}

const crosshairX = (c: HTMLElement) => crosshairAt(c, "x");

function activeOption(surface: HTMLElement): Element | null {
  return surface.querySelector('[role="option"]');
}

/** Wait a frame: the pointer path coalesces into requestAnimationFrame. */
const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

describe("the reference composition no longer captures the page", () => {
  it("replaced role=application with a listbox composite", () => {
    const { container } = render(() => <App />);
    const surface = referenceSurface(container);
    expect(surface.getAttribute("role")).toBe("listbox");
    // ADR-0005 §3: the role is rejected as a default, and no element in the
    // reference may quietly keep it.
    expect(container.querySelector('[role="application"]')).toBeNull();
  });

  it("exposes the whole series through one option, not one tab stop per point", async () => {
    const { container } = render(() => <App />);
    const surface = referenceSurface(container);
    surface.focus();
    await userEvent.keyboard("{ArrowRight}");

    const option = activeOption(surface);
    // 30 days of data behind a single stop and a single rendered option.
    expect(option?.getAttribute("aria-setsize")).toBe("30");
    expect(option?.getAttribute("aria-posinset")).toBe("1");
    expect(surface.querySelectorAll('[tabindex="0"]').length).toBe(0);
  });

  it("announces series, x and y rather than a bare number", async () => {
    const { container } = render(() => <App />);
    const surface = referenceSurface(container);
    surface.focus();
    await userEvent.keyboard("{ArrowRight}");

    const text = activeOption(surface)?.textContent ?? "";
    expect(text).toContain("Sample daily series");
    expect(text).toContain("units");
    expect(text).not.toMatch(/^\d+$/);
  });

  it("moves with Home, End and the Page keys, not only left and right", async () => {
    const { container } = render(() => <App />);
    const surface = referenceSurface(container);
    surface.focus();

    await userEvent.keyboard("{End}");
    expect(activeOption(surface)?.getAttribute("aria-posinset")).toBe("30");
    await userEvent.keyboard("{Home}");
    expect(activeOption(surface)?.getAttribute("aria-posinset")).toBe("1");
    await userEvent.keyboard("{PageDown}");
    expect(activeOption(surface)?.getAttribute("aria-posinset")).toBe("11");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeOption(surface)?.getAttribute("aria-posinset")).toBe("12");
  });
});

describe("pointer and keyboard choose the same datum", () => {
  it("draws the same cursor for the datum the pointer chose and the datum the keyboard chose", async () => {
    // The target is a DATUM, and the two paths must agree about it completely —
    // same ordinal, same drawn pixel, same announced sentence.
    //
    // The pointer is let loose first and whatever it resolves becomes the
    // target, rather than the test computing a pixel and asserting the
    // resolution. That is deliberate: converting a client coordinate into an
    // inner one is the pointer model's arithmetic, which ADR-0002 §1 makes a
    // separate concern with its own phase. What belongs HERE is that once a
    // datum is chosen, it does not matter which input chose it.
    const { container } = render(() => <App />);
    const surface = referenceSurface(container);
    const rect = surface.getBoundingClientRect();
    expect(rect.width, "the surface has no layout to point at").toBeGreaterThan(50);

    // --- POINTER
    await surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.4,
        clientY: rect.top + rect.height * 0.5,
      }),
    );
    await frame();

    const pointerPos = Number(activeOption(surface)?.getAttribute("aria-posinset"));
    const pointerX = crosshairAt(container, "x");
    const pointerY = crosshairAt(container, "y");
    const pointerText = activeOption(surface)?.textContent;
    expect(pointerPos, "the pointer resolved nothing").toBeGreaterThan(1);
    expect(pointerX, "the pointer drew no cursor").toBeDefined();

    // --- KEYBOARD, from a cleared state, to the same ordinal
    surface.focus();
    await userEvent.keyboard("{Escape}");
    expect(crosshairX(container)).toBeUndefined();
    expect(activeOption(surface)).toBeNull();

    await userEvent.keyboard("{Home}");
    await userEvent.keyboard(`{ArrowRight>${pointerPos - 1}/}`);

    expect(Number(activeOption(surface)?.getAttribute("aria-posinset"))).toBe(pointerPos);
    // Identical to the last decimal. A parallel keyboard path would be drawing
    // from its own copy of the scales and would not land here by luck.
    expect(crosshairAt(container, "x")).toBe(pointerX);
    expect(crosshairAt(container, "y")).toBe(pointerY);
    expect(activeOption(surface)?.textContent).toBe(pointerText);
  });

  it("lets the keyboard continue from where the pointer left off", async () => {
    // The strongest available evidence that it is ONE state and not two that
    // happen to agree: if the keyboard kept its own index, stepping after a
    // pointer move would jump back to wherever the keyboard had been.
    const { container } = render(() => <App />);
    const surface = referenceSurface(container);
    const rect = surface.getBoundingClientRect();

    surface.focus();
    await userEvent.keyboard("{Home}");
    expect(activeOption(surface)?.getAttribute("aria-posinset")).toBe("1");

    // Point at roughly three-quarters across; whatever it resolves to, the next
    // arrow press must be that point plus one.
    await surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + rect.width * 0.75,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await frame();

    const afterPointer = Number(activeOption(surface)?.getAttribute("aria-posinset"));
    expect(afterPointer).toBeGreaterThan(1);

    await userEvent.keyboard("{ArrowRight}");
    expect(Number(activeOption(surface)?.getAttribute("aria-posinset"))).toBe(
      afterPointer + 1,
    );
  });

  it("clears the shared state when the pointer leaves, not only on Escape", async () => {
    const { container } = render(() => <App />);
    const surface = referenceSurface(container);
    const rect = surface.getBoundingClientRect();

    await surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
    await frame();
    expect(crosshairX(container)).toBeDefined();

    await surface.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(crosshairX(container)).toBeUndefined();
    expect(activeOption(surface)).toBeNull();
  });
});
