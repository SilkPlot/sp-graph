import { For, type Component, type JSX } from "solid-js";

export interface DataTableProps<T> {
  /** Accessible name for the scroll region. A focusable region must have one. */
  label: string;
  columns: readonly string[];
  rows: readonly T[];
  /** Cells for one row, in column order. The first becomes the row header. */
  cells: (row: T) => readonly JSX.Element[];
}

/**
 * A wide table that scrolls inside its own box.
 *
 * Extracted because the install and environments tables were the same fourteen
 * lines of markup twice, and the accessibility-critical parts are exactly the
 * parts that drift when markup is duplicated: the scroll container has to be
 * focusable, because a region only a mouse can scroll is unreachable for a
 * keyboard-only reader, and a focusable region has to be named. Two copies means
 * a later table gets one of those and not the other.
 *
 * A `<section>` rather than `<div role="region">`: a named section IS a region,
 * and saying it twice is how the two get out of step.
 *
 * The first cell of each row is rendered as a `<th scope="row">`. That is not
 * cosmetic — it is what lets a screen reader announce which row a value belongs
 * to when reading across, and it is the single easiest thing to lose when a
 * table is hand-written for the third time.
 */
export function DataTable<T>(props: DataTableProps<T>): JSX.Element {
  return (
    <section class="table-scroll" tabindex="0" aria-label={props.label}>
      <table>
        <thead>
          <tr>
            <For each={props.columns}>{(c) => <th scope="col">{c}</th>}</For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr>
                <For each={props.cells(row)}>
                  {(cell, i) =>
                    i() === 0 ? <th scope="row">{cell}</th> : <td>{cell}</td>
                  }
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </section>
  );
}

/** Convenience alias for the common all-string case. */
export const TextTable: Component<{
  label: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}> = (props) => (
  <DataTable
    label={props.label}
    columns={props.columns}
    rows={props.rows}
    cells={(r) => r}
  />
);
