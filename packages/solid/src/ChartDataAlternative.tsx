/**
 * ChartDataAlternative — the semantic data alternative, as real HTML.
 *
 * ADR-0005 §2: an informative chart ships BOTH a concise narrative overview and
 * a semantic data alternative. Tables serve exact lookup and verification; a
 * summary serves overview and trend; the research is consistent that users want
 * both, and there is no evidence-backed size threshold at which one replaces the
 * other. So both ship, and point-by-point exploration is an additional surface
 * rather than the only one.
 *
 * This renders a genuine `<table>`, not an ARIA imitation and not a description
 * string with the numbers flattened into it. That is deliberate: a real table
 * gives every assistive technology its own table navigation for free, and gives
 * sighted users rows and columns they frequently prefer to the graphic.
 *
 * It sits OUTSIDE `ChartRoot`'s measured box, as a following sibling in normal
 * document flow. `ChartRoot` is sized to the chart; anything rendered inside it
 * would overflow or overlap the drawing. Final placement is the application's —
 * this component only guarantees the structure exists and is correctly related
 * to the graphic.
 *
 * ## The disclosure, and why collapsing does not hide anything from AT
 *
 * The table is a first-class inspection surface, not only an assistive-technology
 * fallback: people want the numbers behind a chart to take into a spreadsheet.
 * So it ships with a control that reveals it, rather than waiting for an
 * application to build one.
 *
 * Collapsing uses the visually-hidden CLIP technique, never `display: none`.
 * That is the load-bearing decision here. `display: none` and `hidden` remove
 * content from the accessibility tree as well as the page, so a collapsed table
 * would take the data alternative away from exactly the users ADR-0005 built it
 * for, and the "reachable data alternative" guarantee would quietly become
 * "reachable after you find and press a button". The table is therefore ALWAYS
 * in the accessibility tree; the control governs visual presentation only.
 *
 * The honest consequence: `aria-expanded` on that control describes what a
 * sighted reader can see, not what a screen reader can reach. A screen-reader
 * user meets the table whether it reads "collapsed" or not. That is the right
 * way round — the alternative is a button whose state is accurate and whose
 * content is missing.
 */
import { createSignal, createUniqueId, For, Show, type Component, type JSX } from "solid-js";
import { toCsv } from "@silkplot/core";
import type { ChartSemantics } from "./semantics";
import { SP_FOCUSABLE_CLASS } from "./ChartKeyboardSurface";

/** One row of the derived table: the same values the marks were drawn from. */
export type ChartTableRow = readonly (string | number)[];

export interface ChartDataAlternativeProps {
  /** The chart's reactive semantics, from `createChartSemantics`. */
  semantics: ChartSemantics;
  /**
   * Rows derived from the chart's own data, used when the caller's table spec
   * omits `rows`. An accessor, so it tracks the same data replacement the marks
   * track — the table and the picture must never describe different datasets.
   */
  defaultRows?: () => readonly ChartTableRow[];
  /**
   * Headings a composed chart derives from its own shape, used when the caller's
   * spec omits `columns`. Generic by nature; the application's wording wins.
   */
  defaultColumns?: () => readonly string[];
  /**
   * Offer the reveal control. Default true.
   *
   * False keeps the table in the accessibility tree and permanently out of
   * sight, which is what `tableHidden` already means — a chart that opts into
   * that has said it will present the data itself.
   */
  disclosure?: boolean;
  /** Accessible name for the reveal control. Default: "Show data table". */
  showLabel?: string;
  /** Accessible name for the control once open. Default: "Hide data table". */
  hideLabel?: string;
  /**
   * Offer the CSV download. Default true, and only ever alongside a table.
   *
   * The export IS the table — the same derived rows under the same headings —
   * so a chart with no table has nothing to export and shows no control.
   */
  exportable?: boolean;
  /** Visible label for the download control. Default: "Download CSV". */
  exportLabel?: string;
  /**
   * File name, without extension. Defaults to the chart's accessible name
   * slugged, plus the moment of download.
   */
  fileName?: string;
  class?: string;
}

/**
 * Turn a chart name into something a file system will accept.
 *
 * Deliberately lossy and ASCII-only: a download name travels across operating
 * systems with different ideas about legal characters, and a mangled name is a
 * worse outcome than a plain one.
 */
function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned === "" ? "chart" : cleaned;
}

/**
 * Hand the browser a file without a network round trip.
 *
 * The object URL is revoked on a later task rather than immediately after
 * `click()`. Revoking synchronously races the browser's own read of the blob in
 * some engines and produces an empty or failed download; never revoking leaks
 * the blob for the lifetime of the document. A deferred revoke is the one that
 * is neither.
 */
function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Clip an element out of view while leaving it in the accessibility tree.
 *
 * The standard clip-rect technique rather than `display: none` or
 * `visibility: hidden`, both of which remove content from the accessibility
 * tree as well as the page — which would defeat the entire purpose.
 */
const VISUALLY_HIDDEN: JSX.CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  "white-space": "nowrap",
  "border-width": "0",
};

/**
 * The scroll box around the table.
 *
 * `max-width: 100%` with `overflow: auto` is what stops a wide table forcing the
 * whole PAGE to scroll sideways — the failure the documentation site already
 * paid for once, where a generic `table` min-width reached into library output.
 * The table scrolls inside its own box; the document does not move.
 *
 * `max-height` bounds the vertical case for the same reason. A ten-thousand-row
 * series is a legitimate input, and a table that renders all of it inline turns
 * every chart into a page of numbers. The value is an engineering policy, not a
 * standard — see the row-count note in the tests.
 */
const SCROLL_BOX: JSX.CSSProperties = {
  "max-width": "100%",
  "max-height": "20rem",
  "overflow-x": "auto",
  "overflow-y": "auto",
};

export const ChartDataAlternative: Component<ChartDataAlternativeProps> = (props) => {
  const sem = (): ChartSemantics => props.semantics;
  const [open, setOpen] = createSignal(false);
  const regionId = createUniqueId();

  const rows = (): readonly ChartTableRow[] => {
    const spec = sem().table();
    if (spec === undefined) return [];
    return spec.rows ?? props.defaultRows?.() ?? [];
  };
  const columns = (): readonly string[] => {
    const spec = sem().table();
    if (spec === undefined) return [];
    return spec.columns ?? props.defaultColumns?.() ?? [];
  };
  const hasContent = (): boolean =>
    sem().summary() !== undefined || sem().table() !== undefined;

  /**
   * The download, built from exactly what the table renders.
   *
   * Not from `props.defaultRows` and not from the chart's raw series: the file a
   * reader takes away must be the numbers they were looking at, including any
   * narrowing a dashboard range applied. Reading a different source here is how
   * an export and its chart start disagreeing while both look right.
   */
  const exportCsv = (): void => {
    const name = sem().name() || "chart";
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      toCsv({ columns: columns(), rows: rows() }),
      props.fileName ?? `${slug(name)}-${stamp}`,
    );
  };

  /**
   * Withheld under `tableHidden` for the same reason the reveal control is: the
   * whole alternative is clipped there, so a button rendered inside it would be
   * a focusable tab stop landing on nothing a sighted keyboard user can see.
   * An application presenting the data itself presents its own export with it.
   */
  const offersExport = (): boolean =>
    (props.exportable ?? true) && !sem().tableHidden() && sem().table() !== undefined;

  /** The reveal control is offered only when there is a table to reveal. */
  const offersDisclosure = (): boolean =>
    (props.disclosure ?? true) && !sem().tableHidden() && sem().table() !== undefined;

  /** Visible only when a disclosure exists AND it is open. */
  const visible = (): boolean => offersDisclosure() && open();

  /**
   * Clip the table region for the COLLAPSED case only.
   *
   * `tableHidden` clips the whole alternative on the wrapper below — its
   * documented meaning is that the application will present this content
   * itself — so clipping again here would nest one clip inside another for no
   * gain.
   */
  const clipRegion = (): boolean => !sem().tableHidden() && !visible();

  return (
    <Show when={hasContent()}>
      <div
        class={props.class}
        style={sem().tableHidden() ? VISUALLY_HIDDEN : undefined}
        data-silkplot-alternative=""
      >
        <Show when={sem().summary()}>
          {(summary) => <p id={sem().ids.summary}>{summary()}</p>}
        </Show>

        <Show when={offersDisclosure()}>
          <button
            type="button"
            class={SP_FOCUSABLE_CLASS}
            aria-expanded={visible()}
            aria-controls={regionId}
            onClick={() => setOpen(!open())}
            data-silkplot-table-toggle=""
          >
            {visible() ? (props.hideLabel ?? "Hide data table") : (props.showLabel ?? "Show data table")}
          </button>
        </Show>

        <Show when={offersExport()}>
          <button
            type="button"
            class={SP_FOCUSABLE_CLASS}
            onClick={exportCsv}
            // The visible label is short because it sits beside the reveal
            // control; the accessible name carries the chart's own name, so a
            // reader listing the buttons on a dashboard of eight charts can tell
            // which one they are about to download.
            aria-label={`Download ${sem().name() || "chart"} data as CSV`}
            data-silkplot-csv-export=""
          >
            {props.exportLabel ?? "Download CSV"}
          </button>
        </Show>

        <Show when={sem().table()}>
          {(spec) => (
            <div id={regionId} style={clipRegion() ? VISUALLY_HIDDEN : undefined}>
              {/*
                The scroll box is focusable ONLY while visible. A focusable
                element inside a clip-hidden container is a tab stop that lands
                on nothing a sighted keyboard user can see, which fails visible
                focus rather than helping anyone. `role="group"` plus a name is
                what makes a scrollable region announce itself instead of being a
                bare focus stop.
              */}
              <section
                style={SCROLL_BOX}
                class={visible() ? SP_FOCUSABLE_CLASS : undefined}
                // A named `<section>` — a region landmark — rather than a `div`
                // with a role, which is the established pattern for a
                // horizontally scrollable table: the name is what stops it being
                // an unlabelled focus stop, and the landmark is what makes it
                // findable rather than something you fall into.
                //
                // Only the tab stop is conditional. The element and its name are
                // not: a stable structure is easier to reason about than one
                // that changes shape when a button is pressed, and a bare
                // element carrying an `aria-label` is invalid anyway.
                tabindex={visible() ? 0 : undefined}
                aria-label={spec().caption ?? sem().name()}
                data-silkplot-table-scroll=""
              >
                <table id={sem().ids.table}>
                  {/*
                    The caption falls back to the chart's own name so the table is
                    never an orphan list of numbers — a user who lands on it by
                    table navigation, having never touched the graphic, still learns
                    what it is a table OF.
                  */}
                  <caption>{spec().caption ?? sem().name()}</caption>
                  <thead>
                    <tr>
                      <For each={columns()}>{(column) => <th scope="col">{column}</th>}</For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rows()}>
                      {(row) => (
                        <tr>
                          <For each={row}>
                            {(cell, index) =>
                              // The first cell labels its row; the rest are data.
                              // `scope="row"` is what lets a screen reader announce
                              // "March, 42" instead of a bare "42" as the user moves
                              // across the row.
                              index() === 0 ? <th scope="row">{cell}</th> : <td>{cell}</td>
                            }
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </section>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
};
