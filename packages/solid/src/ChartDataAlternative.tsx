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
 */
import { For, Show, type Component, type JSX } from "solid-js";
import type { ChartSemantics } from "./semantics";

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
  class?: string;
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

export const ChartDataAlternative: Component<ChartDataAlternativeProps> = (props) => {
  const sem = (): ChartSemantics => props.semantics;
  const rows = (): readonly ChartTableRow[] => {
    const spec = sem().table();
    if (spec === undefined) return [];
    return spec.rows ?? props.defaultRows?.() ?? [];
  };
  const hasContent = (): boolean =>
    sem().summary() !== undefined || sem().table() !== undefined;

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
        <Show when={sem().table()}>
          {(spec) => (
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
                  <For each={spec().columns}>{(column) => <th scope="col">{column}</th>}</For>
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
          )}
        </Show>
      </div>
    </Show>
  );
};
