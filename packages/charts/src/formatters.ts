/**
 * Caller formatting for the multi-series surface — ADR-0008 §9 made reachable.
 *
 * §9 settles that tick text, units, locale, and display time zone are the
 * caller's, and that the library's defaults stay generic: ISO 8601 instants,
 * unadorned numbers, headings like "Time" and "Value". The defaults were
 * already generic. What was missing was any way to override them on a
 * multi-series chart, so a caller who had the domain wording had nowhere to put
 * it — the single-series path has `pointLabel` and this path had nothing.
 *
 * ## Why four props rather than one
 *
 * Each names the SURFACE it reaches, not the value kind it receives. `x` and
 * the table's instant column both carry a `Date`, and a caller frequently wants
 * different text in each: an axis tick has a few characters of room and wants
 * "04 Mar", while a table cell is read aloud one row at a time and wants the
 * year. Collapsing them behind one "time formatter" would force the shorter of
 * the two on both, and the axis is the one that would win by default.
 *
 * A caller who genuinely wants one wording passes the same function twice,
 * which is explicit and costs nothing. A cascade in the other direction — one
 * prop that silently reaches two surfaces — cannot be undone by a caller.
 *
 * ## What is deliberately NOT here
 *
 * There is no tooltip or announcement formatter, because the multi-series path
 * exposes no tooltip and no active datum. The many-series active-datum model is
 * a later decision (see `MultiSeriesBody`'s header), and adding its formatter
 * here would pre-empt that decision in the worst way, by publishing its
 * signature before the behaviour exists. When that surface is built, its
 * formatter joins this interface.
 */
import type { SeriesTableOptions } from "@silkplot/core";

export interface MultiSeriesFormatProps {
  /**
   * Bottom-axis tick labels. Default: the time scale's own tick format.
   *
   * Changes the LABEL only, never a tick's position, so it cannot move the
   * ticks away from the gridlines drawn behind them.
   */
  xTickFormat?: (value: Date) => string;
  /**
   * Left-axis tick labels. Default: the linear scale's own tick format.
   *
   * This is where a unit belongs on the AXIS — "R 1.2k", "42°" — rather than in
   * the series label, which is the legend's and the table heading's wording.
   */
  yTickFormat?: (value: number) => string;
  /**
   * The data table's instant column. Default: ISO 8601.
   *
   * Reaches the CSV export too, because the export is the table serialised
   * rather than a second derivation of the data — see `tableValueFormat` for
   * what that implies.
   */
  tableTimeFormat?: (t: Date) => string;
  /**
   * A data-table value cell. Default: the raw number, unadorned. Called only
   * for a present reading; a gap stays an empty cell.
   *
   * **This reaches the CSV export.** The export is defined as the table
   * serialised — same rows, same headings — so a formatter that returns
   * `"R 1 234,56"` puts that string in the downloaded file, where a spreadsheet
   * will treat it as text rather than a number. That is the correct consequence
   * of one stated rule rather than a bug: the alternative is a table and an
   * export that disagree about what a cell says, which is worse and silent.
   *
   * Return a NUMBER to change nothing about the export — the return type is
   * `string | number` precisely so a caller can format for display without
   * committing the export to text.
   */
  tableValueFormat?: (y: number, label: string) => string | number;
}

/**
 * The table half of the props, as the options `seriesTable` takes.
 *
 * A function rather than a spread at each call site: the two names differ
 * deliberately (the props say which surface, the core options say which value),
 * and mapping them in one place means a chart cannot wire the value formatter
 * to the time column.
 */
export function tableOptions(props: MultiSeriesFormatProps): SeriesTableOptions {
  return { time: props.tableTimeFormat, value: props.tableValueFormat };
}
