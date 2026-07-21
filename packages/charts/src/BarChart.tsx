/**
 * BarChart — categorical bars, vertical or horizontal.
 *
 * Two input shapes, mutually exclusive, exactly as Line and Area take `data` or
 * `series` (ADR-0008 §12):
 *
 *   - `data`  — the original `{ label, y }[]`. Vertical, unformatted, no
 *     activation. Unchanged, and kept because it is published 0.x surface.
 *   - `categories` — the ranked shape `{ id, label, value }[]`, with
 *     orientation, formatters, and a caller activation seam.
 *
 * **There is ONE render path.** `data` is adapted into `categories` on the way
 * in rather than branching the body, so the legacy shape cannot drift from the
 * ranked one — the failure a second path guarantees eventually. The adapter uses
 * the label as the id, which is exactly what the old surface's identity already
 * was, so nothing about the legacy behaviour changes.
 *
 * ## Why identity moved to an id
 *
 * A ranked chart exists to be reordered, so index identity is wrong by
 * construction, and two categories may legitimately carry the same display text
 * ("Regional total" twice). Labels are display; ids are identity (ADR-0008 §1).
 *
 * ## Why the formatters are named category/value, not x/y
 *
 * ADR-0010 named formatters by SURFACE rather than by value kind. On an
 * orientable chart the axis letters are not a surface — `xTickFormat` would mean
 * the categories in one orientation and the values in the other, so a caller
 * flipping `orientation` would silently swap which formatter applied. The
 * category axis and the value axis are stable under orientation; x and y are
 * not. Same principle, applied to a surface ADR-0010 did not have.
 *
 * D3 does all the math inside memos; Solid renders every bar with `<For>`. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 *
 * TODO(grouped/stacked extension): grouped and stacked variants over
 * `d3-shape` stack after consumer evidence justifies them.
 */
import { For, Show, createMemo, type Component, type JSX } from "solid-js";
import {
  createBandIndex,
  normalizeCategories,
  type ActivePoint,
  type NormalizedCategory,
  type RankedCategory,
  type RankedFormatProps,
} from "@silkplot/core";
import {
  createRankedModel,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
  type RankedModel,
  type RankedOrientation,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import { InteractionLayer, useInspection, type KeyboardHoverProps } from "./inspection";
import {
  ChartShell,
  CATEGORY_COLUMNS,
  createInspectableSemantics,
  assertOneInput,
  type CartesianChartProps,
} from "./scaffold";
import type { CategoryPoint } from "./types";

/**
 * Where a category label is truncated on the axis, before an ellipsis.
 *
 * A default rather than a prop, and overridable through `categoryTickFormat`,
 * which is already the caller's control over that text — a second knob would be
 * two ways to say one thing. The full label always survives in the data table
 * and in the accessible option text, so truncation loses nothing: it is the same
 * position the accessibility contract takes on hiding axes, which is defensible
 * only because the information survives elsewhere.
 *
 * Truncation is by CHARACTER COUNT, not measured text width. Measuring would be
 * more precise and would make every visual baseline depend on font metrics
 * resolved at run time, which is how a deterministic baseline stops being one.
 */
const DEFAULT_LABEL_MAX_CHARS = 20;

/** The layout and presentation props both input shapes share. */
interface BarLayoutProps extends CartesianChartProps {
  /** Band padding as a fraction of the step [0, 1]. Default: bandScale's default (0.1). */
  padding?: number;
  /** Bar fill color. Default: "currentColor". */
  fill?: string;
}

/**
 * The original shape. Vertical only, and the `never`s say so at compile time
 * rather than by silently ignoring a prop that looks like it should work.
 */
export interface SingleCategoryInput extends BarLayoutProps {
  /** The series to plot, as `{ label: string, y: number }[]`. */
  data: readonly CategoryPoint[];
  categories?: never;
  orientation?: never;
  categoryTickFormat?: never;
  valueTickFormat?: never;
  tableValueFormat?: never;
  onActivate?: never;
  keyboard?: never;
  pageSize?: never;
  /** The legacy `data` shape carries no interaction — same reason as `onActivate`. */
  pointer?: never;
  announce?: never;
  tooltip?: never;
  onActivePointChange?: never;
}

export interface RankedInput extends BarLayoutProps, RankedFormatProps, KeyboardHoverProps {
  /**
   * The ranked categories, in the caller's own order.
   *
   * **Nothing here sorts them.** The caller ranked the data to get the ordering
   * they want; a library re-sort would make the picture disagree with the table,
   * the export, and the array that was passed in.
   */
  categories: readonly RankedCategory[];
  /** Which way the bars run. Default `"vertical"`. */
  orientation?: RankedOrientation;
  /**
   * Called when the reader commits a category — Enter or Space on the keyboard
   * composite.
   *
   * Hands back the caller's OWN `RankedCategory`, not a library datum type. That
   * is deliberate and is what makes the seam safe to ship before the general
   * pointer and tooltip contract exists: it commits to nothing about the
   * library's internal model, so the later contract can widen around it rather
   * than having to break it.
   *
   * Routing, filtering, modal and drill-down behaviour are the application's.
   */
  onActivate?: (category: RankedCategory) => void;
  /**
   * Tooltip content, as a render-prop (ADR-0016 §1). Receives the active bar's
   * record — `datum` is the caller's `RankedCategory`, `at.kind` is `"category"`.
   */
  tooltip?: (active: ActivePoint<RankedCategory>) => JSX.Element;
  /** Fires on every active-category CHANGE — a hover, a keyboard step, a clear. */
  onActivePointChange?: (active: ActivePoint<RankedCategory> | undefined) => void;
  data?: never;
}

export type BarChartBaseProps = SingleCategoryInput | RankedInput;

/**
 * A bar chart is informative by default and must be named — see
 * `ChartSemanticsProps`. `decorative` is the explicit opt-out.
 */
export type BarChartProps = BarChartBaseProps & ChartSemanticsProps;

type ResolvedBarProps = BarLayoutProps &
  KeyboardHoverProps & {
    categories: readonly RankedCategory[];
    orientation?: RankedOrientation;
    categoryTickFormat?: (label: string) => string;
    valueTickFormat?: (value: number) => string;
    tableValueFormat?: (value: number) => string;
    onActivate?: (category: RankedCategory) => void;
    tooltip?: (active: ActivePoint<RankedCategory>) => JSX.Element;
    onActivePointChange?: (active: ActivePoint<RankedCategory> | undefined) => void;
  };

type BarChartBodyProps = ResolvedBarProps & { semantics: ChartSemantics };

/**
 * The legacy `{ label, y }` shape as ranked categories.
 *
 * The label becomes the id because that is what the old surface's identity
 * already was — the band domain was built from labels. Callers with duplicate
 * labels were already getting one band for both; they now get a `duplicate-id`
 * diagnostic saying so, which is strictly more information than silence.
 */
function adaptLegacy(data: readonly CategoryPoint[]): readonly RankedCategory[] {
  return data.map((d) => ({ id: d.label, label: d.label, value: d.y }));
}

/** Truncate for the axis. The full text is always reachable elsewhere. */
function truncateLabel(label: string): string {
  return label.length > DEFAULT_LABEL_MAX_CHARS
    ? `${label.slice(0, DEFAULT_LABEL_MAX_CHARS - 1)}…`
    : label;
}

/**
 * The announcement wording for one active category — the FULL label (never the
 * truncated axis text) and the value. One active datum, written by the keyboard
 * and the pointer through the shared inspection, so the cursor and the
 * announcement can never describe different bars (ADR-0002 §1, §4; ADR-0016 §3).
 */
function barLabel(
  props: BarChartBodyProps,
  active: ActivePoint<RankedCategory> | undefined,
): string {
  if (active === undefined) return "";
  const c = active.datum;
  const value = Number.isFinite(c.value)
    ? (props.tableValueFormat?.(c.value) ?? String(c.value))
    : "no value";
  const name = props.semantics.name();
  return name ? `${name}, ${c.label}, ${value}` : `${c.label}, ${value}`;
}

/** One bar, positioned for whichever axis its category landed on. */
const Bar: Component<{
  model: RankedModel;
  category: NormalizedCategory;
  fill?: string;
  /** Emphasised as the active bar — an outline that survives monochrome (ADR-0005 §5). */
  active?: boolean;
}> = (props) => {
  const band = (): number | undefined => props.model.band()(props.category.id);
  const zero = (): number => props.model.value()(0);
  const at = (): number => props.model.value()(props.category.value as number);
  const stroke = (): string => (props.active ? "var(--sp-color-cursor, currentColor)" : "none");
  const strokeWidth = (): number => (props.active ? 2 : 0);

  return (
    // A broken or absent value is drawn as NO BAR rather than as a zero-height
    // one at the baseline: a zero-height rect at zero is exactly what a real
    // measurement of zero looks like.
    <Show when={band() !== undefined && props.category.value !== null}>
      {props.model.orientation() === "vertical" ? (
        <rect
          x={band()}
          // The smaller pixel coordinate and the absolute distance: a negative
          // value hangs below the baseline, and SVG rejects a negative height.
          y={Math.min(zero(), at())}
          width={props.model.band().bandwidth()}
          height={Math.abs(at() - zero())}
          fill={props.fill ?? "currentColor"}
          stroke={stroke()}
          stroke-width={strokeWidth()}
        />
      ) : (
        <rect
          // The horizontal mirror: a negative value runs LEFT of the baseline,
          // so x is the smaller coordinate and width the absolute distance.
          x={Math.min(zero(), at())}
          y={band()}
          width={Math.abs(at() - zero())}
          height={props.model.band().bandwidth()}
          fill={props.fill ?? "currentColor"}
          stroke={stroke()}
          stroke-width={strokeWidth()}
        />
      )}
    </Show>
  );
};

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All scales
 * are memos that recompute only when data or size change.
 */
const BarChartBody: Component<BarChartBodyProps> = (props) => {
  // One normalisation, so the marks, the axis, the table and the keyboard all
  // read the same model rather than four independent ones.
  const model = createMemo(() => normalizeCategories(props.categories));
  const categories = (): readonly NormalizedCategory[] => model().categories;

  const ranked = createRankedModel({
    categories,
    orientation: () => props.orientation ?? "vertical",
    padding: () => props.padding,
  });

  const isVertical = (): boolean => ranked.orientation() === "vertical";

  // The band lookup: a pointer is over a bar's band or between bands. The
  // selection axis follows orientation — the x coordinate picks the band on a
  // vertical chart, the y coordinate on a horizontal one (ADR-0014 §2).
  const index = createMemo(() => {
    const b = ranked.band();
    const bw = b.bandwidth();
    const v = ranked.value();
    const vertical = isVertical();
    const start = (c: RankedCategory): number => b(c.id) ?? Number.NaN;
    return createBandIndex<RankedCategory>(props.categories, {
      category: (c) => c.id,
      bandStart: start,
      bandEnd: (c) => start(c) + bw,
      axis: (px, py) => (vertical ? px : py),
      px: (c) => (vertical ? start(c) + bw / 2 : v(c.value)),
      py: (c) => (vertical ? v(c.value) : start(c) + bw / 2),
    });
  });

  const insp = useInspection<RankedCategory>({
    index,
    semantics: () => props.semantics,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    // ADR-0013's commit hands back the caller's OWN category, unchanged.
    onActivate: props.onActivate ? (a) => props.onActivate?.(a.datum) : undefined,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<RankedCategory> | undefined => insp.inspection.point();

  /**
   * The band domain is ids, so the axis must resolve one back to its label
   * before any caller formatting. A formatter receiving an id would be handed
   * identity and asked to render display text.
   */
  const categoryFormat = (id: string): string => {
    const label = model().byId.get(id)?.label ?? id;
    return props.categoryTickFormat?.(label) ?? truncateLabel(label);
  };

  return (
    <>
      <CartesianFrame
        model={ranked}
        layout={props}
        semantics={props.semantics}
        // Which formatter reaches which axis follows orientation — which is the
        // whole reason the props are not named for the axes.
        xFormat={isVertical() ? categoryFormat : props.valueTickFormat}
        yFormat={isVertical() ? props.valueTickFormat : categoryFormat}
      >
        <For each={categories()}>
          {(c) => (
            <Bar
              model={ranked}
              category={c}
              fill={props.fill}
              active={active()?.datum.id === c.id}
            />
          )}
        </For>
      </CartesianFrame>

      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={(a) => barLabel(props, a)}
          live={insp.live()}
          keyboard={insp.enabled()}
          pointer={insp.pointer()}
          instruction="Use arrow keys to step through categories."
          tooltip={props.tooltip}
        />
      </Show>
    </>
  );
};

export const BarChart: Component<BarChartProps> = (props) => {
  const semantics = createInspectableSemantics(props);

  // ADR-0008 §12's runtime backstop, for callers arriving untyped. The typed
  // props already make both-at-once unrepresentable.
  assertOneInput(
    { data: props.data, series: props.categories },
    { inputName: "categories" },
  );

  const resolved = (): readonly RankedCategory[] =>
    props.categories ?? adaptLegacy(props.data ?? []);

  const rows = (): readonly ChartTableRow[] =>
    resolved().map(
      (c) =>
        [
          // The FULL label. The table is where the untruncated text lives.
          c.label,
          Number.isFinite(c.value)
            ? (props.tableValueFormat?.(c.value) ?? c.value)
            : "",
        ] as const,
    );

  return (
    <ChartShell layout={props} semantics={semantics} rows={rows} columns={CATEGORY_COLUMNS}>
      <BarChartBody
        {...(props as ResolvedBarProps)}
        categories={resolved()}
        semantics={semantics}
      />
    </ChartShell>
  );
};
