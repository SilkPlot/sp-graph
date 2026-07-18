/**
 * The visual-regression acceptance set, declared as data.
 *
 * This file — not "whichever baseline files happen to exist" — is what the
 * harness is accountable to. Every baseline the suite captures is generated
 * from `ACCEPTANCE_SET` below, and `acceptance-set.spec.ts` asserts the set
 * against frozen totals and against the rendered DOM. A case deleted from this
 * file, a chart that quietly loses its focus stop, or a baseline file that no
 * declaration points at are each a failure rather than a smaller green run.
 *
 * That guard is the point. A visual suite whose scope is implicit shrinks
 * silently: someone removes a fixture, the run goes green faster, and nobody
 * reads a passing suite closely enough to notice it stopped covering something.
 *
 * Scope is the alpha surface only. Deliberate exclusions are listed in
 * `EXCLUSIONS` with the reason each one is out, so "not covered" is a recorded
 * decision rather than an omission somebody has to reconstruct.
 */

/** The chart families that ship in the alpha. */
export const CHARTS = ["line", "area", "bar", "scatter"] as const;
export type Chart = (typeof CHARTS)[number];

/**
 * Rendering cases. Each is a shape that has previously broken, or a shape whose
 * breakage would be invisible to the structural tests:
 *
 * - `default` — the ordinary series; the reference geometry.
 * - `empty` — no data. Scales have no extent and marks have nothing to draw;
 *   the frame must still render rather than collapsing or throwing.
 * - `negative` — an all-negative series. This is the ONLY input where
 *   `zero-floor` and `zero-baseline` differ visibly, which is what makes
 *   collapsing the two y-domain policies an easy and invisible mistake.
 * - `dense-label` — a narrow box with far more ticks than fit. Label collision
 *   and overflow are pure rendering defects: geometry assertions pass through
 *   them without noticing.
 * - `responsive-mobile` — a narrow viewport with a fluid container, so the
 *   measured-bounds path is exercised at a size the desktop cases never reach.
 */
export const CASES = [
  "default",
  "empty",
  "negative",
  "dense-label",
  "responsive-mobile",
] as const;
export type Case = (typeof CASES)[number];

/**
 * The four scheme x contrast combinations.
 *
 * `prefers-color-scheme` and `prefers-contrast` are ORTHOGONAL preferences, not
 * a three-value ladder, and all four cells are first-class (ADR-0004). The
 * fourth cell is not a formality: a single high-contrast palette on `:root`
 * painted light high-contrast values onto a dark surface and measured 1.16:1,
 * so "more contrast" produced an invisible page. Every one of the four is
 * captured for every chart and every case.
 *
 * Both axes are emulated through the user-agent media queries rather than the
 * `data-sp-theme` attribute, because the media-query path is the one a user's
 * OS actually drives, and contrast is not application-selectable by design.
 */
export const THEME_STATES = [
  "light",
  "dark",
  "light-high-contrast",
  "dark-high-contrast",
] as const;
export type ThemeState = (typeof THEME_STATES)[number];

export interface ThemeEmulation {
  colorScheme: "light" | "dark";
  contrast: "no-preference" | "more";
}

export const THEME_EMULATION: Record<ThemeState, ThemeEmulation> = {
  light: { colorScheme: "light", contrast: "no-preference" },
  dark: { colorScheme: "dark", contrast: "no-preference" },
  "light-high-contrast": { colorScheme: "light", contrast: "more" },
  "dark-high-contrast": { colorScheme: "dark", contrast: "more" },
};

/** Reduced motion is captured on both schemes; contrast is orthogonal to it. */
export const MOTION_THEME_STATES = ["light", "dark"] as const satisfies readonly ThemeState[];

export interface Viewport {
  width: number;
  height: number;
}

export const DESKTOP_VIEWPORT: Viewport = { width: 1024, height: 768 };
export const MOBILE_VIEWPORT: Viewport = { width: 390, height: 844 };

export const viewportFor = (kase: Case): Viewport =>
  kase === "responsive-mobile" ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT;

/**
 * Which charts own a focus stop, and why the others do not.
 *
 * This is the half of the acceptance set that a future feature could shrink
 * without anyone noticing. Only `LineChart` composes `ChartKeyboardSurface`
 * today, so only `LineChart` has a `:focus-visible` treatment to capture.
 * `acceptance-set.spec.ts` asserts this against the rendered DOM in both
 * directions, so the day `BarChart` gains a keyboard composite the guard fails
 * until a focus baseline is declared for it — rather than the suite staying
 * green while an unproven focus indicator ships.
 */
export const FOCUSABLE: Record<Chart, boolean> = {
  line: true,
  area: false,
  bar: false,
  scatter: false,
};

/** Why each non-focusable chart has no focus baseline. Kept as prose on purpose. */
export const FOCUS_RATIONALE: Record<Chart, string> = {
  line: "composes ChartKeyboardSurface, so it has one tab stop and a :focus-visible ring",
  area: "no keyboard composite yet — nothing in the chart can receive focus",
  bar: "no keyboard composite yet — nothing in the chart can receive focus",
  scatter: "no keyboard composite yet — nothing in the chart can receive focus",
};

export type BaselineKind = "geometry" | "focus" | "reduced-motion";

export interface Baseline {
  /** Stable id; also the baseline file name (`<id>.png`). */
  id: string;
  kind: BaselineKind;
  chart: Chart;
  /** Focus and reduced-motion baselines are captured on the `default` case. */
  case: Case;
  theme: ThemeState;
  reducedMotion: boolean;
  focus: boolean;
  viewport: Viewport;
}

const geometry = (): Baseline[] =>
  CHARTS.flatMap((chart) =>
    CASES.flatMap((kase) =>
      THEME_STATES.map((theme) => ({
        id: `${chart}--${kase}--${theme}`,
        kind: "geometry" as const,
        chart,
        case: kase,
        theme,
        reducedMotion: false,
        focus: false,
        viewport: viewportFor(kase),
      })),
    ),
  );

const focus = (): Baseline[] =>
  CHARTS.filter((chart) => FOCUSABLE[chart]).flatMap((chart) =>
    THEME_STATES.map((theme) => ({
      id: `${chart}--focus--${theme}`,
      kind: "focus" as const,
      chart,
      case: "default" as const,
      theme,
      reducedMotion: false,
      focus: true,
      viewport: DESKTOP_VIEWPORT,
    })),
  );

const reducedMotion = (): Baseline[] =>
  CHARTS.flatMap((chart) =>
    MOTION_THEME_STATES.map((theme) => ({
      id: `${chart}--reduced-motion--${theme}`,
      kind: "reduced-motion" as const,
      chart,
      case: "default" as const,
      theme,
      reducedMotion: true,
      focus: false,
      viewport: DESKTOP_VIEWPORT,
    })),
  );

export const ACCEPTANCE_SET: readonly Baseline[] = [
  ...geometry(),
  ...focus(),
  ...reducedMotion(),
];

/**
 * Frozen totals. These are asserted, not derived from the array at assertion
 * time — deriving both sides of a check from the same source proves only that
 * the source is self-consistent, which it always is.
 *
 * 4 charts x 5 cases x 4 scheme/contrast combinations = 80
 * 1 focusable chart x 4 scheme/contrast combinations  =  4
 * 4 charts x 2 schemes, reduced motion                =  8
 */
export const EXPECTED_TOTALS = {
  geometry: 80,
  focus: 4,
  "reduced-motion": 8,
  all: 92,
} as const;

/**
 * Surfaces deliberately NOT baselined, and why. Recorded so that "there is no
 * baseline for X" is always answerable, and so a reviewer can tell an excluded
 * surface from a forgotten one.
 */
export const EXCLUSIONS: ReadonlyArray<{ surface: string; reason: string }> = [
  {
    surface: "Legend",
    reason: "not built — the legend surface is planned work, and there is nothing to pin",
  },
  {
    surface: "Calendar week grid",
    reason: "not built — the calendar layout engine is deferred to a backlog item",
  },
  {
    surface: "Canvas rendering substrate",
    reason:
      "not built — SVG is the only substrate today; Canvas is selected only if representative profiling calls for it",
  },
  {
    surface: "The HTML data alternative (`<table>`)",
    reason:
      "structural, and asserted directly by the accessibility suite on its markup and ARIA relationships. Pinning its pixels would re-test text layout, which is where a screenshot gate is least informative and most brittle. Fixtures render without a `table` prop so no table is in frame",
  },
  {
    surface: "Cross-platform pixel identity",
    reason:
      "out of scope by design. Baselines are pinned to one environment; see docs/visual-regression.md",
  },
];
