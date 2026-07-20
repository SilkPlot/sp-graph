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
  "multi-one",
  "multi-four",
  "multi-22",
  "multi-22-narrow",
  "multi-gaps",
  "multi-ref-one",
  "multi-ref-three",
] as const;
export type Case = (typeof CASES)[number];

/**
 * The multi-series cases (ADR-0008), and the charts that can render them.
 *
 * These break the otherwise-uniform chart x case cross product, and that is a
 * property of the library rather than an inconvenience: `bar` and `scatter`
 * have no multi-series surface, so a bar+multi baseline would be a picture of
 * nothing under a confident name. They are generated separately below and the
 * frozen totals account for them separately.
 *
 * - `multi-one` — one series through the `series` API. NOT redundant with
 *   `default`, which goes through the single-series `data` prop and a different
 *   code path; §12 promises both stay supported, so both are pinned.
 * - `multi-four` — four same-unit series, the ordinary operational shape.
 * - `multi-22` — the density ADR-0008 names, and the case that exercises
 *   palette WRAP. Colours repeat beyond the palette size by design (ADR-0009),
 *   so this is where a wrap becoming a collision, or the dash channel being
 *   dropped, would show.
 * - `multi-22-narrow` — the same twenty-two in a fluid narrow box, where the
 *   measured-bounds path runs at a size the desktop cases never reach.
 * - `multi-gaps` — four series each carrying a null at a different index, under
 *   both gap policies. A null coerced to zero draws a spike to the baseline,
 *   which is a picture rather than an error and passes every path-counting
 *   assertion.
 * - `multi-ref-one` — one reference overlay (ADR-0008 §10). Pins the reference
 *   colour token and its dash across all four scheme/contrast combinations,
 *   which is the half of the overlay no geometry assertion can see: a token
 *   that resolved to the surface colour, or a dash silently dropped, renders a
 *   perfectly valid line nobody can distinguish from the marks.
 * - `multi-ref-three` — three references, two of them a hair apart on the same
 *   axis plus one temporal. This is the LABEL COLLISION case, and collision is
 *   the property a screenshot is the only witness to: overprinted labels are
 *   unreadable and pass every assertion the browser suite can make about them.
 *
 * Deliberately NOT given visual cases: signed, constant, empty, and
 * out-of-domain references. Each is covered deterministically in
 * `packages/charts/test/reference-overlay.test.tsx`, where the assertion is
 * about a computed pixel rather than about how the picture looks — a screenshot
 * of an out-of-domain reference is a screenshot of its absence, which pins
 * nothing a diff could meaningfully catch. That scoping is a decision, recorded
 * here rather than left to be inferred from which baselines exist.
 */
export const MULTI_CASES = [
  "multi-one",
  "multi-four",
  "multi-22",
  "multi-22-narrow",
  "multi-gaps",
  "multi-ref-one",
  "multi-ref-three",
] as const satisfies readonly Case[];
export type MultiCase = (typeof MULTI_CASES)[number];

/**
 * The legend is a PRIMITIVE, not a chart family, and it gets its own axis here
 * rather than being forced into the chart x case product.
 *
 * Adding it to `CHARTS` was the obvious move and is wrong: `CHARTS` means "the
 * chart families the alpha ships", the focus map is keyed on it, and a legend
 * has no data, no axes, and no y-domain policy. A separate surface keeps the
 * chart product honest and lets the legend carry the cases that actually
 * distinguish it — wrap versus stack, and the density where clipping starts.
 */
export const LEGEND_CASES = [
  "legend-four",
  "legend-22",
  "legend-22-narrow",
  "legend-stack-scroll",
  "legend-some-hidden",
] as const;
export type LegendCase = (typeof LEGEND_CASES)[number];

/** Everything a baseline can be captured of: the four charts, plus the legend. */
export type Surface = Chart | "legend";

/** Only these two compose the multi-series surface today. */
export const MULTI_CHARTS = ["line", "area"] as const satisfies readonly Chart[];

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

export const viewportFor = (kase: Case | LegendCase): Viewport =>
  kase === "responsive-mobile" || kase === "multi-22-narrow" || kase === "legend-22-narrow"
    ? MOBILE_VIEWPORT
    : DESKTOP_VIEWPORT;

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
  bar: true,
  scatter: false,
};

/** Why each non-focusable chart has no focus baseline. Kept as prose on purpose. */
export const FOCUS_RATIONALE: Record<Chart, string> = {
  line: "composes ChartKeyboardSurface, so it has one tab stop and a :focus-visible ring",
  area: "no keyboard composite yet — nothing in the chart can receive focus",
  bar: "composes ChartKeyboardSurface, so it has one tab stop and a :focus-visible ring",
  scatter: "no keyboard composite yet — nothing in the chart can receive focus",
};

export type BaselineKind = "geometry" | "focus" | "reduced-motion";

export interface Baseline {
  /** Stable id; also the baseline file name (`<id>.png`). */
  id: string;
  kind: BaselineKind;
  /** The chart family, or `legend` for the standalone primitive. */
  chart: Surface;
  /** Focus and reduced-motion baselines are captured on the `default` case. */
  case: Case | LegendCase;
  theme: ThemeState;
  reducedMotion: boolean;
  focus: boolean;
  viewport: Viewport;
}

const isMultiCase = (kase: Case): kase is MultiCase =>
  (MULTI_CASES as readonly Case[]).includes(kase);

/** The uniform product: every chart x every NON-multi case x every theme. */
const geometry = (): Baseline[] =>
  CHARTS.flatMap((chart) =>
    CASES.filter((kase) => !isMultiCase(kase)).flatMap((kase) =>
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

/**
 * The multi-series product, kept apart because it is not uniform: only `line`
 * and `area` compose the surface, so this is two charts rather than four.
 */
const multiSeries = (): Baseline[] =>
  MULTI_CHARTS.flatMap((chart) =>
    MULTI_CASES.flatMap((kase) =>
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

/**
 * Reduced motion over the multi-series surface, on `multi-four` only.
 *
 * One case rather than all five: reduced motion is a global preference and the
 * chart honours it identically whatever the series count, so capturing it five
 * times would pin the same claim five ways. `multi-four` is the ordinary shape.
 */
const multiReducedMotion = (): Baseline[] =>
  MULTI_CHARTS.flatMap((chart) =>
    MOTION_THEME_STATES.map((theme) => ({
      id: `${chart}--multi-four-reduced-motion--${theme}`,
      kind: "reduced-motion" as const,
      chart,
      case: "multi-four" as const,
      theme,
      reducedMotion: true,
      focus: false,
      viewport: DESKTOP_VIEWPORT,
    })),
  );

/**
 * The legend's own baselines.
 *
 * Its focus family exists for a reason the acceptance criteria name directly:
 * a 22-entry legend must stay operable "without clipping focused items", and a
 * focus ring drawn on the entry nearest a scroll edge is exactly where clipping
 * shows up. That is a computed style under `:focus-visible`, so no structural
 * assertion reaches it.
 */
const legend = (): Baseline[] =>
  LEGEND_CASES.flatMap((kase) =>
    THEME_STATES.map((theme) => ({
      id: `legend--${kase}--${theme}`,
      kind: "geometry" as const,
      chart: "legend" as const,
      case: kase,
      theme,
      reducedMotion: false,
      focus: false,
      viewport: viewportFor(kase),
    })),
  );

const legendFocus = (): Baseline[] =>
  THEME_STATES.map((theme) => ({
    id: `legend--focus--${theme}`,
    kind: "focus" as const,
    chart: "legend" as const,
    case: "legend-22" as const,
    theme,
    reducedMotion: false,
    focus: true,
    viewport: DESKTOP_VIEWPORT,
  }));

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
  ...multiSeries(),
  ...legend(),
  ...focus(),
  ...legendFocus(),
  ...reducedMotion(),
  ...multiReducedMotion(),
];

/**
 * Frozen totals. These are asserted, not derived from the array at assertion
 * time — deriving both sides of a check from the same source proves only that
 * the source is self-consistent, which it always is.
 *
 * 4 charts x 5 single-series cases x 4 scheme/contrast   =  80
 * 2 multi-capable charts x 7 multi cases x 4 combinations =  56
 * 5 legend cases x 4 combinations                          =  20
 *                                              geometry    = 156
 * 2 focusable charts x 4 scheme/contrast combinations      =   8
 * the legend, focused, x 4 combinations                    =   4
 *                                                 focus    =  12
 * 4 charts x 2 schemes, reduced motion                     =   8
 * 2 multi-capable charts x 2 schemes, reduced motion       =   4
 *                                        reduced-motion    =  12
 */
export const EXPECTED_TOTALS = {
  geometry: 156,
  focus: 12,
  "reduced-motion": 12,
  all: 180,
} as const;

/**
 * Surfaces deliberately NOT baselined, and why. Recorded so that "there is no
 * baseline for X" is always answerable, and so a reviewer can tell an excluded
 * surface from a forgotten one.
 */
export const EXCLUSIONS: ReadonlyArray<{ surface: string; reason: string }> = [
  // The Legend was listed here as "not built" until 2026-07-20 and is now
  // captured as its own surface — see `LEGEND_CASES` and `legend()` above. It is
  // deliberately NOT re-listed as an exclusion, because it is no longer one.
  //
  // Worth stating why this went stale: the legend baselines were added to this
  // same file without anyone revisiting the list below it, so the file asserted
  // both "24 legend baselines" and "the legend has no baselines" at once. This
  // list is the authority for "there is no baseline for X" — an entry left here
  // after a surface ships is a confident wrong answer, not a harmless leftover.
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
      "structural, and asserted directly by the accessibility suite on its markup and ARIA relationships. Pinning its pixels would re-test text layout, which is where a screenshot gate is least informative and most brittle. Fixtures pass `tableHidden` so no table is in frame — before 2026-07-19 passing no `table` prop was enough, but charts now render one by default",
  },
  {
    surface: "Cross-platform pixel identity",
    reason:
      "out of scope by design. Baselines are pinned to one environment; see docs/visual-regression.md",
  },
];
