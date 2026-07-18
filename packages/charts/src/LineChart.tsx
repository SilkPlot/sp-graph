/**
 * LineChart — a time series drawn as a single `linePath` stroke.
 *
 * The scaffolding — bounds, pixel ranges, the y-domain policy — comes from
 * `createCartesianModel`; the axes and the SVG frame from `CartesianFrame`.
 * What is written here is only what makes this chart a line chart:
 *
 *   - a time x-domain covering the data's extent;
 *   - a "zero-floor" y-domain, because a line has no baseline to honour;
 *   - one stroked path, no fill.
 *
 * D3 does all the math inside memos; Solid renders every element. No
 * d3-selection, d3-transition, or d3-axis anywhere.
 */
import { createMemo, Show, type Component } from "solid-js";
import { timeScale, linePath, extentOf, type CurveName } from "@silkplot/core";
import {
  ChartRoot,
  ChartAnnouncer,
  ChartDataAlternative,
  ChartKeyboardSurface,
  Crosshair,
  createActiveDatum,
  createCartesianModel,
  createChartKeyboard,
  createChartSemantics,
  type ChartSemantics,
  type ChartSemanticsProps,
  type ChartTableRow,
  type Margins,
} from "@silkplot/solid";
import { CartesianFrame } from "./CartesianFrame";
import type { TimePoint } from "./types";

export interface LineChartBaseProps {
  /** The series to plot, as `{ t: Date, y: number }[]`. */
  data: readonly TimePoint[];
  /** Fixed width in px. Omit to fill and measure the parent. */
  width?: number;
  /** Fixed height in px. Omit to fill and measure the parent. */
  height?: number;
  margins?: Partial<Margins>;
  /** Line curve preset. Default: "monotoneX". */
  curve?: CurveName;
  /**
   * Treat a datum as present. Return false and the line breaks at that point
   * rather than drawing through it — the way to render a known gap (a sensor
   * offline, a month with no reading) instead of implying data you do not have.
   *
   * This ANDs with the library's own finite check; it cannot switch it off. A
   * datum whose scaled position is not finite has no pixel to occupy, so it is
   * always a gap, whatever this returns.
   */
  defined?: (d: TimePoint, index: number) => boolean;
  /** Stroke color. Default: "currentColor". */
  stroke?: string;
  /** Stroke width in px. Default: 1.5. */
  strokeWidth?: number;
  /** Draw tick-aligned gridlines behind the marks. Default: true. */
  gridlines?: boolean;
  /**
   * Give the chart the single-entry keyboard composite. Default: true for an
   * informative chart, always off for a decorative one.
   *
   * On by default because ADR-0005 makes the keyboard model library behaviour
   * rather than a per-application reference, and because "optional
   * accessibility ships as absent accessibility" is the failure this contract
   * exists to prevent. Tab reaches the chart once; arrows, Home/End and Page
   * keys move within it; Tab leaves. A decorative chart is out of the
   * accessibility tree entirely, so a focusable surface on one would be a tab
   * stop that announces nothing.
   */
  keyboard?: boolean;
  /**
   * How many points a Page Up / Page Down step covers. Default:
   * `DEFAULT_PAGE_SIZE`, an engineering policy rather than a standard.
   */
  pageSize?: number;
  /**
   * Accessible wording for one point — series, x, y, and units. Default: the
   * chart's own name, the ISO timestamp, and the value.
   *
   * The default is honest but not good: ADR-0005 §4 asks for "Bookings, Tuesday
   * 4 March, 42 appointments", and the library knows neither that the unit is
   * appointments nor how this application writes a date. Supply this and the
   * announcement becomes a sentence instead of a reading of the data.
   */
  pointLabel?: (d: TimePoint, index: number) => string;
  /**
   * Which channel carries a keyboard step.
   *
   * - `"live"` (default) — a polite live region, per ADR-0005 §4.
   * - `"option"` — `aria-activedescendant` moves to the rendered option, which
   *   is the APG mechanism for a listbox and avoids depending on live-region
   *   behaviour that varies by reader and version.
   *
   * They are mutually exclusive by construction. Running both announces every
   * step twice.
   */
  announce?: "live" | "option";
  class?: string;
}

/**
 * A line chart is informative by default and must be named — see
 * `ChartSemanticsProps`. `decorative` is the explicit opt-out; there is no
 * implicit one.
 */
export type LineChartProps = LineChartBaseProps & ChartSemanticsProps;

type LineChartBodyProps = LineChartBaseProps & { semantics: ChartSemantics };

/**
 * Inner body: runs INSIDE ChartRoot so it can read reactive bounds. All scales,
 * the path, and ticks are memos that recompute only when data or size change.
 */
const LineChartBody: Component<LineChartBodyProps> = (props) => {
  const model = createCartesianModel({
    data: () => props.data,
    // The time domain is the data's EXTENT, not its first and last datum.
    //
    // Taking the ends assumed the series was already sorted, and silently drew
    // nonsense when it was not: [Jan 10, Jan 1, Jan 5] produced a REVERSED
    // domain, and the middle point rendered outside the plot area entirely
    // (scales do not clamp by default). The comment that used to sit here
    // claimed the opposite — that reading the ends stopped a stray out-of-order
    // point widening the axis. It never did that; it just failed differently.
    //
    // The contract is now: the domain covers your data, and the path follows
    // your array. The second half is d3-shape's own behaviour and is why marks
    // still draw in array order — the honest fix for a scrambled series is to
    // sort it before passing it in. Sorting here is the only super-linear
    // option, and this scan is one the y-axis already makes over the same array.
    x: (range) => {
      const [lo, hi] = extentOf(props.data, (d) => d.t.getTime());
      return timeScale({ domain: [new Date(lo), new Date(hi)], range });
    },
    // A line has no baseline to honour, so zero is only the floor — the top
    // stays the data's own maximum. Area and Bar deliberately differ.
    y: { accessor: (d) => d.y, domain: "zero-floor" },
  });

  const pathD = createMemo(() => {
    const xs = model.x();
    const ys = model.y();
    const px = (d: TimePoint): number => xs(d.t);
    const py = (d: TimePoint): number => ys(d.y);
    return linePath(props.data, {
      x: px,
      y: py,
      // The finite check is the library's and is not optional: a datum that maps
      // to a non-finite pixel has nowhere to be drawn, and passing it through
      // yields `M0,100L100,NaN` — a `d` the browser abandons at the bad segment,
      // silently truncating the line. `extentOf` already keeps such values out
      // of the DOMAIN; this keeps them out of the MARK, which is the other half
      // of the same policy and does not follow from the first.
      defined: (d, i) =>
        Number.isFinite(px(d)) && Number.isFinite(py(d)) && (props.defined?.(d, i) ?? true),
      curve: props.curve ?? "monotoneX",
    });
  });

  // ONE active-datum state. The keyboard writes it here; a pointer model writes
  // the same object when composed-chart hit-testing arrives. There is no second
  // place to keep an answer, which is what stops the cursor and the announcement
  // ever describing different points (ADR-0002 §1, §4).
  const active = createActiveDatum({
    count: () => props.data.length,
    pageSize: props.pageSize,
  });
  const keyboard = createChartKeyboard({ active });

  const sem = (): ChartSemantics => props.semantics;
  const enabled = (): boolean => !sem().decorative() && (props.keyboard ?? true);
  const usesLiveRegion = (): boolean => (props.announce ?? "live") === "live";

  const datum = (): TimePoint | undefined => {
    const i = active.index();
    return i === undefined ? undefined : props.data[i];
  };

  const pointLabel = (index: number): string => {
    const d = props.data[index];
    if (d === undefined) return "";
    if (props.pointLabel) return props.pointLabel(d, index);
    // ISO 8601 for the same reason the derived table rows use it: it is
    // unambiguous and locale-independent, and anything friendlier is domain
    // wording this library would be inventing. The chart's own name stands in
    // for the series context ADR-0005 §4 asks for.
    const series = sem().name();
    return series ? `${series}, ${d.t.toISOString()}, ${d.y}` : `${d.t.toISOString()}, ${d.y}`;
  };

  return (
    <>
      <CartesianFrame
        x={model.x()}
        y={model.y()}
        hasArea={model.hasArea()}
        gridlines={props.gridlines}
        semantics={props.semantics}
        class={props.class}
      >
        <path
          d={pathD()}
          fill="none"
          stroke={props.stroke ?? "currentColor"}
          stroke-width={props.strokeWidth ?? 1.5}
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        {/*
          The active point is marked visually as well as programmatically. A
          keyboard user who can see the screen gets nothing from an announcement
          alone, and the ringed marker is drawn in SIZE and OUTLINE as well as
          colour so it survives a monochrome rendering (ADR-0005 §5). The
          surface-coloured under-ring keeps it legible over a gridline.
        */}
        <Show when={datum()}>
          {(d) => (
            <>
              <circle
                cx={model.x()(d().t)}
                cy={model.y()(d().y)}
                r="7"
                fill="none"
                stroke="var(--sp-color-surface, #ffffff)"
                stroke-width="4"
              />
              <circle
                cx={model.x()(d().t)}
                cy={model.y()(d().y)}
                r="7"
                fill="none"
                stroke="var(--sp-color-cursor, currentColor)"
                stroke-width="2"
              />
              <Crosshair x={model.x()(d().t)} y={model.y()(d().y)} />
            </>
          )}
        </Show>
      </CartesianFrame>

      <Show when={enabled()}>
        <ChartKeyboardSurface
          keyboard={keyboard}
          optionLabel={pointLabel}
          activeDescendant={!usesLiveRegion()}
          label={
            sem().name()
              ? `${sem().name()}. Use arrow keys to step through points.`
              : undefined
          }
          labelledBy={sem().name() ? undefined : sem().labelledBy()}
          describedBy={sem().describedBy()}
        />
      </Show>

      {/*
        The live region carries the committed step. It is throttled inside
        `ChartAnnouncer`, so a held arrow key produces announcements at the
        primitive's policy rate rather than at the key-repeat rate — and the
        last point of the burst is always the one left in the region.

        It renders only in `announce="live"` mode. In `"option"` mode
        `aria-activedescendant` carries the step instead, and running both would
        announce every step twice.
      */}
      <Show when={enabled() && usesLiveRegion()}>
        <ChartAnnouncer
          message={active.index() === undefined ? "" : pointLabel(active.index()!)}
        />
      </Show>
    </>
  );
};

export const LineChart: Component<LineChartProps> = (props) => {
  // Resolved OUTSIDE ChartRoot, because the data alternative is a sibling of
  // the measured box rather than a child of it — ChartRoot is sized to the
  // chart, and a table rendered inside it would overlap the drawing.
  const semantics = createChartSemantics(props);

  return (
    <>
      <ChartRoot width={props.width} height={props.height} margins={props.margins}>
        <LineChartBody {...props} semantics={semantics} />
      </ChartRoot>
      {/*
        Rows derived from the same `props.data` the path is drawn from, read
        inside an accessor so a data replacement moves both together. Timestamps
        go out as ISO 8601: it is unambiguous and locale-independent, and any
        other rendering is domain wording the library cannot invent — pass
        `table.rows` to control it.
      */}
      <ChartDataAlternative
        semantics={semantics}
        defaultRows={(): readonly ChartTableRow[] =>
          props.data.map((d) => [d.t.toISOString(), d.y] as const)
        }
      />
    </>
  );
};
