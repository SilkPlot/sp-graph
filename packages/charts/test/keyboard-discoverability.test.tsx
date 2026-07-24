/**
 * Keyboard discoverability on a hovered chart.
 *
 * The defect this suite exists to catch reached production BECAUSE the existing
 * gesture suite could not see it: `viewport-gestures.test.tsx` dispatches its
 * keydowns straight at the keyboard surface — the surface it was written
 * against — so it passes whether or not a user could ever get a key THERE. A
 * real browser sends every keydown to the FOCUSED element, the surface needs
 * DOM focus that hover never delivers, and with `brushSelect` on the gesture
 * layer's `preventDefault()` on `pointerdown` suppresses even the browser's own
 * mousedown focus — so on production the viewport keys did nothing a user could
 * discover.
 *
 * So this suite drives input the way a user does — real pointer moves, real
 * clicks, and real key presses through the browser's input pipeline
 * (`userEvent`) — and asserts on where the events actually LAND. It was watched
 * to go red against the pre-fix behaviour before the fix landed, and the
 * detection probes (`surface-focus-on-pointerdown`, `hint-touch-gate`) keep
 * that failure reproducible.
 *
 * The touch test runs FIRST, before anything moves the real mouse: Chromium
 * fires boundary events when content appears under a stationary cursor, so a
 * mouse parked over the previous test's chart could otherwise hand this test a
 * real hover it must not have.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import { BarChart, LineChart } from "../src/index";
import type { TimePoint } from "../src/index";
import { HEIGHT, NO_MARGINS, WIDTH, markD, pathXs } from "./support";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const day = (n: number): Date => new Date(T0 + n * DAY);

const DATA: TimePoint[] = [
  { t: day(0), y: 100 },
  { t: day(1), y: 40 },
  { t: day(2), y: 60 },
  { t: day(3), y: 50 },
  { t: day(4), y: 5 },
];

/** The chart's single keyboard surface — the one tab stop that receives keys. */
function surfaceOf(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-silkplot-keyboard-surface]");
  if (el === null) throw new Error("no keyboard surface rendered");
  return el;
}

/** The hover affordance, if rendered. */
function hintOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-silkplot-keyboard-hint]");
}

function pointCount(container: HTMLElement): number {
  return pathXs(markD(container)).length;
}

/** One frame — the pointer loop and the brush paint are rAF-coalesced. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Dispatch a synthetic pointer event at a plot-x (inner px), the same way the
 *  gesture suite does — for the brush, whose drag geometry real input cannot
 *  express portably. Synthetic events exercise the same handlers; what they do
 *  NOT exercise is focus and key routing, which the real-input tests own. */
function pointer(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  plotX: number,
): void {
  const clientX = el.getBoundingClientRect().left + plotX; // NO_MARGINS → margin.left = 0
  el.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX,
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe("the hover affordance", () => {
  // FIRST in the file — see the header on why this must run before any test
  // that moves the real mouse.
  it("does not appear for a touch pointer, which has no hover and no keyboard to invite", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    surface.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "touch" }));
    const hint = hintOf(container);
    expect(hint, "the affordance element must exist on a navigable chart").not.toBeNull();
    expect(
      hint!.style.opacity,
      "a touch pointer must not be invited to a keyboard it does not have",
    ).toBe("0");
  });

  it("does not exist at all on a chart without viewport gestures", () => {
    const { container } = render(() => (
      <BarChart
        title="Spend"
        data={[
          { label: "a", y: 10 },
          { label: "b", y: 25 },
        ]}
        width={WIDTH}
        height={HEIGHT}
      />
    ));
    expect(surfaceOf(container)).not.toBeNull(); // the keyboard composite is there
    expect(hintOf(container), "no viewport keys, no viewport-keys affordance").toBeNull();
  });

  it("is animated only through the motion token, so reduced motion stills it", () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    // The theme collapses every `--sp-motion-*` token to 0ms under
    // `prefers-reduced-motion: reduce` (proven in the theme suite), and the
    // fallback is 0ms so an unthemed page never animates at all. Animating
    // through the token — and only through it — is what makes the affordance
    // honour reduced motion by construction.
    expect(hintOf(container)!.style.transition).toContain("var(--sp-motion-fast, 0ms)");
  });

  it("appears on a hovered, unfocused chart, naming the keyboard path, and leaves with the pointer", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    const hint = hintOf(container)!;
    expect(hint.style.opacity, "no affordance before anything is hovered").toBe("0");

    await userEvent.hover(surface);
    expect(
      hint.style.opacity,
      "a hovered, unfocused chart must show the keyboard affordance",
    ).toBe("1");
    // It names the path: take focus, then these keys.
    const text = hint.textContent ?? "";
    expect(text).toContain("Click");
    expect(text).toContain("+");
    expect(text).toContain("0");
    // It is a visual signifier for the pointer user; the accessible instruction
    // already lives on the composite's own label, and announcing both would say
    // everything twice.
    expect(hint.getAttribute("aria-hidden")).toBe("true");
    // It must never intercept the pointer it is advising.
    expect(hint.style.pointerEvents).toBe("none");

    await userEvent.unhover(surface);
    expect(hint.style.opacity, "the affordance leaves with the pointer").toBe("0");
  });

  it("hides once focus is taken — its own advice, completed", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    const hint = hintOf(container)!;
    await userEvent.hover(surface);
    expect(hint.style.opacity).toBe("1");
    await userEvent.click(surface);
    expect(
      hint.style.opacity,
      "once the chart has focus the affordance has nothing left to say",
    ).toBe("0");
  });
});

describe("viewport keys need focus, and pointer-down takes it", () => {
  it("hover alone leaves the keys dead; a real click takes focus and the keys work", async () => {
    // `brushSelect` on — the production shape. The brush's `preventDefault()`
    // on `pointerdown` suppresses the browser's own mousedown focus, so
    // WITHOUT the explicit pointer-down focus a click grants nothing.
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        brushSelect
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const surface = surfaceOf(container);
    expect(pointCount(container)).toBe(5);

    await userEvent.hover(surface);
    await userEvent.keyboard("+");
    await nextFrame();
    // Hover is a pointer state. The keydown went to `body` and was discarded.
    expect(
      pointCount(container),
      "a hovered, unfocused chart must not receive viewport keys",
    ).toBe(5);
    expect(document.activeElement === surface).toBe(false);

    await userEvent.click(surface);
    expect(
      document.activeElement === surface,
      "a pointer-down on the plot must give the chart focus",
    ).toBe(true);

    await userEvent.keyboard("+");
    await nextFrame();
    expect(
      pointCount(container),
      "the viewport keys must work once focus is taken",
    ).toBeLessThan(5);
  });

  it("the same pointer-down that takes focus still starts a brush", async () => {
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        brushSelect
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const surface = surfaceOf(container);
    pointer(surface, "pointerdown", 100);
    expect(
      document.activeElement === surface,
      "the brush's own pointer-down must still give the chart focus",
    ).toBe(true);
    pointer(surface, "pointermove", 300);
    await nextFrame();
    pointer(surface, "pointerup", 300);
    expect(
      pointCount(container),
      "taking focus must not have eaten the brush the same event started",
    ).toBeLessThan(5);
  });

  it("focus can always leave: Tab moves on from a clicked chart", async () => {
    const { container } = render(() => (
      <LineChart title="Readings" data={DATA} width={WIDTH} height={HEIGHT} margins={NO_MARGINS} curve="linear" />
    ));
    const surface = surfaceOf(container);
    await userEvent.click(surface);
    expect(document.activeElement === surface).toBe(true);
    await userEvent.tab();
    expect(document.activeElement === surface, "the chart must never be a focus trap").toBe(false);
  });

  it("the datum composite is untouched: arrows step and Enter commits on the clicked chart", async () => {
    const seen: unknown[] = [];
    const { container } = render(() => (
      <LineChart
        title="Readings"
        data={DATA}
        onActivate={(active) => seen.push(active.datum)}
        width={WIDTH}
        height={HEIGHT}
        margins={NO_MARGINS}
        curve="linear"
      />
    ));
    const surface = surfaceOf(container);
    await userEvent.click(surface);
    expect(document.activeElement === surface).toBe(true);
    await userEvent.keyboard("{ArrowRight}");
    await nextFrame();
    await userEvent.keyboard("{Enter}");
    expect(
      seen.length,
      "Enter on the focused chart must still commit the active datum",
    ).toBeGreaterThan(0);
  });
});
