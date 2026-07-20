/**
 * Site content that is data rather than prose — the package matrix, the
 * environment table, and the alpha's stated limits.
 *
 * Kept out of the JSX so the honesty-critical parts of the page are reviewable
 * as a list rather than hunted through markup. Everything here is public-safe by
 * construction: no private repository names, no research identifiers, no
 * internal planning identifiers.
 */

export const REPO_URL = "https://github.com/SilkPlot/sp-graph";

/**
 * Whether the packages are on the public registry yet.
 *
 * A single flag rather than prose in three places, because the install section,
 * the status line, and the limitations list all have to change together and
 * "documentation that says it is installable when it is not" is the worst
 * possible first impression.
 *
 * FLIPPING THIS IS A PUBLICATION STEP, not an editorial one. It belongs to the
 * release checklist in the repository, alongside the other manual checks, and
 * must not be flipped in advance of an actual publish.
 *
 * Flipped to true when 0.2.0-next.0 went to the registry, and only after a
 * fresh project outside any clone installed it by `@next`, typechecked against
 * the published declarations, production-built, and rendered a chart.
 */
export const ON_REGISTRY = true;

/** A file in the public repository, on the default branch. */
export function repoFile(path: string): string {
  return `${REPO_URL}/blob/main/${path}`;
}

export interface PackageRow {
  name: string;
  purpose: string;
  status: "Alpha" | "Stub";
  note: string;
}

/**
 * The package matrix.
 *
 * `calendar` is listed with its real state rather than omitted. A reader who
 * finds the package in the repository and no mention of it here would reasonably
 * assume it works; saying "stub" is shorter than the support thread.
 */
export const PACKAGES: readonly PackageRow[] = [
  {
    name: "@silkplot/core",
    purpose: "Scales, extents, ticks, path shapes, overlap packing, hit indexes",
    status: "Alpha",
    note: "Pure functions over D3's math modules. No Solid, no DOM.",
  },
  {
    name: "@silkplot/theme",
    purpose: "Design tokens, CSS custom properties, palettes, focus treatment",
    status: "Alpha",
    note: "Scheme and contrast resolve as four first-class combinations.",
  },
  {
    name: "@silkplot/solid",
    purpose: "Primitives — chart root, SVG layer, axes, gridlines, legend, crosshair, keyboard surface",
    status: "Alpha",
    note: "Compose these when a preset chart is not the graph you want.",
  },
  {
    name: "@silkplot/charts",
    purpose: "Composed charts — Line, Area, Bar, Scatter",
    status: "Alpha",
    note: "Each one composes the same Cartesian model the primitives expose.",
  },
  {
    name: "@silkplot/calendar",
    purpose: "Time-grid and calendar layout",
    status: "Stub",
    note: "Typed but not implemented — its entry point throws. Not published.",
  },
];

export interface EnvironmentRow {
  what: string;
  requirement: string;
  why: string;
}

export const ENVIRONMENTS: readonly EnvironmentRow[] = [
  {
    what: "Solid",
    requirement: "^1.9",
    why: "A peer dependency. Your application owns the one copy of Solid.",
  },
  {
    what: "Node",
    requirement: ">=22.12",
    why: "For building. The published bundles run in the browser.",
  },
  {
    what: "Module format",
    requirement: "ESM only",
    why: "No CommonJS build. Subpath exports keep unimported code out of your bundle.",
  },
  {
    what: "Bundler",
    requirement: "Solid-aware (Vite + vite-plugin-solid, or equivalent)",
    why: "The \"solid\" export condition serves TSX source so your bundler compiles the JSX itself — that is what keeps fine-grained reactivity intact.",
  },
  {
    what: "Browsers",
    requirement: "Current Chrome, Firefox, Safari, and Edge",
    why: "Automated verification runs in headless Chromium. Other engines are expected to work and are not yet gated.",
  },
];

export interface Limitation {
  headline: string;
  detail: string;
}

/**
 * What the alpha does not do.
 *
 * Written as commitments a reader can plan around rather than as apology. The
 * accessibility entry names the missing evidence specifically: automated
 * checking is real and extensive, and it is not the same thing as a person with
 * a screen reader having used this.
 */
export const LIMITATIONS: readonly Limitation[] = [
  {
    headline: "No assistive technology has been tested",
    detail:
      "Every accessibility claim rests on deterministic automated evidence — computed styles, accessibility-tree assertions, and keyboard and announcement behaviour in real headless Chromium. Not one screen reader has been run against it, not even partially. No WCAG conformance is claimed at any level.",
  },
  {
    headline: "0.x, and breaking changes arrive without a major bump",
    detail:
      "Pin an exact version. Breaking changes are documented as decision records in the repository, but 0.x semantics mean a minor release may contain them.",
  },
  {
    headline: "Pointer hover is not yet built into the chart components",
    detail:
      "The crosshair, tooltip anchor, and hit index all exist and are exported, and the reference composition wires them together. What is not yet built is the reusable pointer-to-datum model, so hover is something you compose today rather than a prop you set.",
  },
  {
    headline: "No grouped or stacked bars, and no brush or zoom",
    detail:
      "Multi-series line and area charts ship, as does a legend with controlled visibility. What is not implemented is grouped and stacked bars, and brush or zoom navigation.",
  },
  {
    headline: "SVG only",
    detail:
      "There is no Canvas or WebGL substrate yet. Density beyond a few thousand marks is untested, and that is where the rendering approach is expected to have to change.",
  },
  {
    headline: "The calendar package is a stub",
    detail: "It is typed, its entry point throws, and it is not published.",
  },
];
