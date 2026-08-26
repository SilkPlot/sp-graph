/**
 * Multi-series BarChart — grouped or stacked, over the shared series model.
 *
 * Sibling of the single-series body, not a rewrite of it. The ranked `data` /
 * `categories` path stays the one-render-path adapter it already is; this
 * path consumes `normalizeSeries` and the core bar layout so identity,
 * visibility, missing values, the legend, and the derived table cannot drift
 * from Line and Area.
 */
import { For, Show, createMemo, type Component, type JSX } from "solid-js";
import {
  CATEGORY_LABEL_ROTATION_DEG,
  bandScale,
  categoryTimesOf,
  groupSeries,
  layoutBarRects,
  linearScale,
  locateBarRect,
  normalizeSeries,
  resolveCategoryLabelRotation,
  resolveMeasuredCategoryLeft,
  resolveSeriesStyle,
  seriesTable,
  stackSeries,
  stackedValueDomain,
  valueDomainOf,
  type ActivePoint,
  type BarMode,
  type BarRect,
  type NormalizedSeries,
  type RankedOrientation,
  type Series,
  type SeriesDatum,
} from "@silkplot/core";
import {
  applyYDomainPolicy,
  useChartBounds,
  type ChartSemantics,
  type MarginReservation,
  type Margins,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import { InteractionLayer, useInspection } from "./inspection";
import { measurePaintedAxisLabelWidth } from "./measure-axis-label";
import {
  ChartShell,
  type CartesianChartProps,
} from "./scaffold";
import { tableOptions, type MultiSeriesFormatProps } from "./formatters";
import type { KeyboardHoverProps } from "./inspection";

/** Re-export so the public prop surface names one type. */
export type { BarMode };

export interface MultiSeriesBarInput
  extends CartesianChartProps, MultiSeriesFormatProps, KeyboardHoverProps {
  mode: BarMode;
  series: readonly Series[];
  visibleSeries?: readonly string[];
  orientation?: RankedOrientation;
  /** Category-axis tick text. Receives the default ISO date label. */
  categoryTickFormat?: (label: string) => string;
  /** Value-axis tick text. Orientation-stable; x/y are not. */
  valueTickFormat?: (value: number) => string;
  padding?: number;
  rotateCategoryLabels?: boolean;
  measureCategoryLeftMargin?: boolean;
  tooltip?: (active: ActivePoint<SeriesDatum>) => JSX.Element;
  onActivate?: (active: ActivePoint<SeriesDatum>) => void;
  onActivePointChange?: (active: ActivePoint<SeriesDatum> | undefined) => void;
  data?: never;
  categories?: never;
}

export type MultiSeriesBarProps = MultiSeriesBarInput & {
  semantics: ChartSemantics;
};

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function categoryLabel(time: number, props: MultiSeriesBarProps): string {
  const date = new Date(time);
  if (props.categoryTickFormat) return props.categoryTickFormat(isoDate(time));
  if (props.xTickFormat) return props.xTickFormat(date);
  return isoDate(time);
}

export function valueLabel(value: number, seriesLabel: string, props: MultiSeriesBarProps): string {
  const formatted = props.tableValueFormat?.(value, seriesLabel);
  if (formatted !== undefined) return String(formatted);
  if (props.valueTickFormat) return props.valueTickFormat(value);
  return String(value);
}

/** Fill token for one series; `currentColor` if the palette map has no entry. */
export function seriesFillOf(fills: ReadonlyMap<string, string>, seriesId: string): string {
  return fills.get(seriesId) ?? "currentColor";
}

/**
 * One inspectable record from a painted rectangle, or `undefined` when the
 * ordinal is past the layout. A missing series or missing reading still
 * produces a record — inspection names the rectangle it found, and the
 * source index falls back to 0 rather than inventing a hole in the cursor.
 */
export function activeFromBarRect(
  r: BarRect | undefined,
  byId: ReadonlyMap<string, NormalizedSeries>,
  categoryOf: (time: number) => string,
): ActivePoint<SeriesDatum> | undefined {
  if (r === undefined) return undefined;
  const s = byId.get(r.seriesId);
  const d = s?.data.find((point) => point.time === r.time);
  return {
    seriesId: r.seriesId,
    sourceIndex: d?.sourceIndex ?? 0,
    datum: { t: new Date(r.time), y: r.value, meta: d?.meta } satisfies SeriesDatum,
    position: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    at: { kind: "category" as const, category: categoryOf(r.time) },
  };
}

/**
 * Screen-reader wording for one active multi-series bar.
 *
 * Same shape as the ranked `barLabel`: chart name (when the chart names
 * itself), series, category, value. A missing or non-finite reading is
 * "no value", never the word "null".
 */
export function announceMultiBar(
  point: ActivePoint<SeriesDatum> | undefined,
  options: {
    seriesLabel?: string;
    chartName: string;
    category: string;
    formatValue: (value: number, seriesLabel: string) => string;
  },
): string {
  if (point === undefined) return "";
  const label = options.seriesLabel ?? point.seriesId;
  const value = point.datum.y;
  const worded =
    value === null || !Number.isFinite(value)
      ? "no value"
      : options.formatValue(value, label);
  const body = `${label}, ${options.category}, ${worded}`;
  return options.chartName ? `${options.chartName}, ${body}` : body;
}

function displayedLabels(times: readonly number[], props: MultiSeriesBarProps): readonly string[] {
  return times.map((time) => categoryLabel(time, props));
}

const SegmentBar: Component<{
  rect: BarRect;
  fill: string;
  active: boolean;
}> = (props) => (
  <rect
    x={props.rect.x}
    y={props.rect.y}
    width={props.rect.width}
    height={props.rect.height}
    fill={props.fill}
    stroke={props.active ? "var(--sp-color-cursor, currentColor)" : "none"}
    stroke-width={props.active ? 2 : 0}
  />
);

const MultiBarBody: Component<MultiSeriesBarProps> = (props) => {
  const bounds = useChartBounds();
  const model = createMemo(() =>
    normalizeSeries(props.series, { visibleSeries: props.visibleSeries }),
  );
  const visible = (): readonly NormalizedSeries[] => model().visible;
  const keys = createMemo(() => categoryTimesOf(visible()));
  const orientation = (): RankedOrientation => props.orientation ?? "vertical";
  const isVertical = (): boolean => orientation() === "vertical";

  const segments = createMemo(() => {
    const series = visible();
    const times = keys();
    return props.mode === "stacked" ? stackSeries(series, times) : groupSeries(series, times);
  });

  const band = createMemo(() =>
    bandScale({
      domain: keys().map(String),
      range: isVertical() ? [0, bounds().innerWidth] : [0, bounds().innerHeight],
      padding: props.padding,
    }),
  );

  const value = createMemo(() => {
    const raw =
      props.mode === "stacked"
        ? stackedValueDomain(segments())
        : valueDomainOf(visible());
    return linearScale({
      domain: applyYDomainPolicy(raw, "zero-baseline"),
      range: isVertical() ? [bounds().innerHeight, 0] : [0, bounds().innerWidth],
    });
  });

  const seriesIds = createMemo(() => visible().map((s) => s.id));

  const rects = createMemo(() =>
    layoutBarRects(segments(), {
      mode: props.mode,
      orientation: orientation(),
      band: band(),
      value: value(),
      seriesIds: seriesIds(),
    }),
  );

  const frame = {
    bounds,
    x: () => (isVertical() ? band() : value()),
    y: () => (isVertical() ? value() : band()),
    hasArea: () => bounds().innerWidth > 0 && bounds().innerHeight > 0,
  };

  const fills = createMemo(() => {
    const map = new Map<string, string>();
    for (const s of model().series) {
      const style = resolveSeriesStyle(s.style, s.sourceIndex, { area: true });
      map.set(s.id, style.fill ?? style.stroke);
    }
    return map;
  });

  const index = createMemo(() => {
    const drawn = rects();
    const byId = model().byId;
    return {
      length: drawn.length,
      at: (ordinal: number) =>
        activeFromBarRect(drawn[ordinal], byId, (time) => categoryLabel(time, props)),
      locate: (px: number, py: number) => locateBarRect(drawn, px, py),
    };
  });

  const insp = useInspection<SeriesDatum>({
    index,
    semantics: () => props.semantics,
    keyboard: props.keyboard,
    pointer: props.pointer,
    pageSize: props.pageSize,
    announce: props.announce,
    onActivate: props.onActivate,
    onActivePointChange: props.onActivePointChange,
  });
  const active = (): ActivePoint<SeriesDatum> | undefined => insp.inspection.point();

  const categoryFormat = (id: string): string => categoryLabel(Number(id), props);
  const valueFormat = (n: number): string =>
    props.valueTickFormat?.(n) ?? props.yTickFormat?.(n) ?? String(n);

  const xLabelRotation = (): number | undefined => {
    const decision = resolveCategoryLabelRotation({
      optedIn: props.rotateCategoryLabels === true && isVertical(),
      labels: displayedLabels(keys(), props),
      innerWidth: bounds().innerWidth,
      padding: props.padding,
    });
    return decision.rotate ? CATEGORY_LABEL_ROTATION_DEG : undefined;
  };

  const announce = (point: ActivePoint<SeriesDatum> | undefined): string => {
    const series = point === undefined ? undefined : model().byId.get(point.seriesId);
    return announceMultiBar(point, {
      seriesLabel: series?.label,
      chartName: props.semantics.name(),
      category: point === undefined ? "" : categoryLabel(point.datum.t.getTime(), props),
      formatValue: (value, label) => valueLabel(value, label, props),
    });
  };

  return (
    <>
      <CartesianFrame
        model={frame}
        layout={props}
        semantics={props.semantics}
        xFormat={isVertical() ? categoryFormat : valueFormat}
        yFormat={isVertical() ? valueFormat : categoryFormat}
        xLabelRotation={xLabelRotation()}
      >
        <For each={rects()}>
          {(r) => (
            <SegmentBar
              rect={r}
              fill={seriesFillOf(fills(), r.seriesId)}
              active={
                active()?.seriesId === r.seriesId &&
                active()?.datum.t.getTime() === r.time
              }
            />
          )}
        </For>
      </CartesianFrame>

      <Show when={insp.enabled() || insp.pointer()}>
        <InteractionLayer
          inspection={insp.inspection}
          semantics={props.semantics}
          label={announce}
          live={insp.live()}
          keyboard={insp.enabled()}
          pointer={insp.pointer()}
          instruction="Use arrow keys to step through bars."
          tooltip={props.tooltip}
        />
      </Show>
    </>
  );
};

export const BarChartMulti: Component<MultiSeriesBarProps> = (props) => {
  const model = createMemo(() =>
    normalizeSeries(props.series, { visibleSeries: props.visibleSeries }),
  );
  const table = createMemo(() => seriesTable(model(), tableOptions(props)));

  const reserved: MarginReservation = (inner) => {
    const times = categoryTimesOf(model().visible);
    const rotation = resolveCategoryLabelRotation({
      optedIn: props.rotateCategoryLabels === true && (props.orientation ?? "vertical") === "vertical",
      labels: displayedLabels(times, props),
      innerWidth: inner.width,
      padding: props.padding,
    });
    const left = resolveMeasuredCategoryLeft({
      optedIn: props.measureCategoryLeftMargin === true,
      orientation: props.orientation ?? "vertical",
      labels: displayedLabels(times, props),
      measureWidth: measurePaintedAxisLabelWidth,
    });
    const reservation: Partial<Margins> = {};
    if (rotation.rotate) reservation.bottom = rotation.reservedBottom;
    if (left.reservedLeft > 0) reservation.left = left.reservedLeft;
    return rotation.rotate || left.reservedLeft > 0 ? reservation : undefined;
  };

  return (
    <ChartShell
      layout={props}
      reserved={reserved}
      semantics={props.semantics}
      rows={() => table().rows}
      columns={table().columns}
    >
      <MultiBarBody {...props} />
    </ChartShell>
  );
};
