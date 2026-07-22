/**
 * The example registry — where a displayed snippet is made unable to lie.
 *
 * Documentation code rots in one specific way: the prose shows one thing and the
 * library does another, because the snippet is a STRING that nobody compiles.
 * Every "update the docs" task that got skipped lives in that gap.
 *
 * So there are no snippet strings here. Each example is a real `.tsx` module
 * that the site's own `tsc -b` typechecks and Vite compiles, and it is pulled in
 * TWICE over the SAME glob pattern:
 *
 *   - once as a module, giving the component that actually renders on the page;
 *   - once with `?raw`, giving the exact bytes of that same file to display.
 *
 * The two globs share one pattern, so they cannot address different files. There
 * is no pairing table to fall out of date, no snippet to forget to update, and
 * no way to show code that does not compile: the rendered chart and the printed
 * source come from one file, or the build fails.
 *
 * Adding an example is therefore: drop a `.tsx` file in this directory that
 * default-exports a `Component`, and add its title below.
 */
import type { Component } from "solid-js";

/** The rendering half: each example module's default export. */
const modules = import.meta.glob<{ default: Component }>("./[0-9]*.tsx", {
  eager: true,
});

/** The displaying half: the same files, as source text. */
const sources = import.meta.glob<string>("./[0-9]*.tsx", {
  eager: true,
  query: "?raw",
  import: "default",
});

/**
 * Human wording per example. Deliberately the ONLY hand-maintained mapping, and
 * deliberately not load-bearing for correctness: a stale title is cosmetic,
 * whereas a stale snippet is a false claim about the library. The keys are
 * checked against the files on disk below, so this cannot silently drift either.
 */
const TITLES: Record<string, { title: string; blurb: string }> = {
  "./01-line.tsx": {
    title: "Line",
    blurb:
      "A time series. The y-domain uses the zero-floor policy — a line has no baseline to honour.",
  },
  "./02-area.tsx": {
    title: "Area",
    blurb:
      "A filled series. Its domain always contains zero, because the fill is drawn from zero.",
  },
  "./03-bar.tsx": {
    title: "Bar",
    blurb: "A categorical series on a band scale, with a negative value to show the baseline.",
  },
  "./04-scatter.tsx": {
    title: "Scatter",
    blurb: "A point cloud. Zero is not forced into the domain — that would squash the cloud.",
  },
  "./05-theming.tsx": {
    title: "Theming",
    blurb: "Forcing a colour scheme on a subtree, and reading a series' redundant channels.",
  },
  "./06-navigate.tsx": {
    title: "Navigate a time series",
    blurb:
      "Zoom with Ctrl/Cmd+wheel or pinch, drag to brush an interval, or use the keyboard — + and - zoom, Shift+arrows pan, a autoscales, 0 resets. Every gesture has a keyboard equivalent.",
  },
  "./07-range-control.tsx": {
    title: "Range control",
    blurb:
      "The visible, touch-usable navigator over the same viewport. One signal wires the chart and the control, so a brush on the chart moves the band and the handles move the chart — no second authority.",
  },
  "./08-linked-dashboard.tsx": {
    title: "Linked dashboard",
    blurb:
      "Drag on either top chart and both follow — a member's gestures set the dashboard's shared selection. The pinned reference week deliberately ignores it; isolation is what sections are for.",
  },
};

export interface DocExample {
  /** The glob key — the file's path relative to this directory. */
  id: string;
  /** Basename, shown as the source filename above the snippet. */
  file: string;
  title: string;
  blurb: string;
  /** The live component. */
  Component: Component;
  /** The exact source of the file that `Component` came from. */
  source: string;
}

/**
 * Fail loudly, at module load, if the titles and the files disagree.
 *
 * The alternative — rendering an untitled example, or silently dropping one —
 * is the failure mode this whole file exists to prevent, and it would reach the
 * public site looking like a layout bug rather than a missing example. The
 * site's browser test loads this module, so a mismatch fails CI.
 */
function assertTitlesMatchFiles(): void {
  const onDisk = Object.keys(modules).sort();
  const titled = Object.keys(TITLES).sort();

  const untitled = onDisk.filter((k) => !titled.includes(k));
  const orphaned = titled.filter((k) => !onDisk.includes(k));

  if (untitled.length > 0 || orphaned.length > 0) {
    const parts: string[] = [];
    if (untitled.length > 0) {
      parts.push(`example files with no title: ${untitled.join(", ")}`);
    }
    if (orphaned.length > 0) {
      parts.push(`titles with no example file: ${orphaned.join(", ")}`);
    }
    throw new Error(`Example registry is inconsistent — ${parts.join("; ")}`);
  }
}

assertTitlesMatchFiles();

/** Every example, in filename order. The numeric prefix is what orders them. */
export const examples: readonly DocExample[] = Object.keys(modules)
  .sort()
  .map((id) => {
    const mod = modules[id];
    const source = sources[id];
    const meta = TITLES[id];

    // Narrowing rather than asserting: `noUncheckedIndexedAccess` is on, and a
    // non-null assertion here would be exactly the shortcut that lets a broken
    // registry render a blank card instead of failing.
    if (mod === undefined || source === undefined || meta === undefined) {
      throw new Error(`Example ${id} is missing its module, source, or title.`);
    }

    return {
      id,
      file: id.replace("./", ""),
      title: meta.title,
      blurb: meta.blurb,
      Component: mod.default,
      source: source.trimEnd(),
    };
  });
