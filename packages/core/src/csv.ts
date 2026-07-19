/**
 * CSV serialisation — the chart's own table, as a file.
 *
 * Written here rather than taken from a dependency. Bundle size is a budget, and
 * correct CSV is a small, well-specified amount of code; importing a library for
 * it would cost every consumer more than writing it costs us.
 *
 * ## The dialect, and why each part of it
 *
 * RFC 4180: comma delimiter, `"` quoting with internal quotes doubled, CRLF line
 * endings. UTF-8 with a byte-order mark. Instants arrive already formatted as ISO
 * 8601 by the chart that derived the rows, so this module never touches a `Date`
 * and cannot disagree with the table about how one is written.
 *
 * The BOM is the decision most likely to be "simplified" away later, so: without
 * it, Excel decodes a UTF-8 file as the system code page and mangles every
 * non-ASCII label, while every other tool reads it correctly. The file therefore
 * looks fine everywhere except the place most people open it.
 *
 * ## Formula injection
 *
 * A spreadsheet treats a cell beginning `=`, `+`, `-`, `@`, tab, or carriage
 * return as a formula. Since a spreadsheet is the stated destination of this
 * feature, that is the primary path rather than an edge case, and neutralising
 * it is a correctness requirement rather than a hardening option.
 *
 * The mitigation is OWASP's: prefix the offending value with a single quote.
 * Earlier practice used a tab, which was abandoned because it made tab itself a
 * vector. See OWASP's CSV Injection entry and the Symfony advisory that moved to
 * the same rule.
 *
 * **The guard applies to STRINGS ONLY, and that is not an oversight.** `-5` is a
 * negative number, not a formula; guarding it would emit `'-5` and turn a
 * numeric column into text in the very spreadsheet this feature exists to serve.
 * A value that arrived as a JavaScript `number` cannot be a formula, because it
 * was never text. Only text can carry one.
 *
 * **Honest limitation:** this protects the file as written. It does not survive
 * a user opening the file in Excel, saving it, and reopening it — no
 * serialisation-side mitigation does, and claiming otherwise would be a
 * guarantee this code cannot keep.
 */

/** Characters that make a spreadsheet read a cell as a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"] as const;

/** RFC 4180 line ending. */
const CRLF = "\r\n";

/** U+FEFF, so Excel decodes the file as UTF-8 rather than the system code page. */
export const UTF8_BOM = "﻿";

export interface CsvTable {
  /** Header row. Omit for a headerless file. */
  columns?: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}

export interface CsvOptions {
  /**
   * Prepend a UTF-8 byte-order mark. Default true — see the note above on why
   * this exists and what removing it breaks.
   */
  bom?: boolean;
}

/**
 * Render one value as a CSV field.
 *
 * Exported for the tests that pin each rule individually; a caller wanting a
 * whole file wants {@link toCsv}.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    // A non-finite number has no spreadsheet representation that survives a
    // round trip: `NaN` and `Infinity` land as TEXT in a numeric column and
    // poison every formula that touches it. An empty cell is the honest reading
    // — "no value here" — and is what a spreadsheet already means by it.
    if (!Number.isFinite(value)) return "";
    // No injection guard: a number was never text and cannot carry a formula.
    return quoteIfNeeded(String(value));
  }

  const guarded = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;
  return quoteIfNeeded(guarded);
}

/**
 * Quote a field only where the dialect requires it.
 *
 * Quoting everything would be valid RFC 4180 and is what many implementations
 * do. It is not done here because an unquoted file is the one a human can read
 * in a text editor, and a numeric column that arrives quoted is a column some
 * tools import as text.
 */
function quoteIfNeeded(field: string): string {
  const needsQuotes =
    field.includes('"') ||
    field.includes(",") ||
    field.includes("\n") ||
    field.includes("\r") ||
    field.startsWith(" ") ||
    field.endsWith(" ");
  if (!needsQuotes) return field;
  return `"${field.replaceAll('"', '""')}"`;
}

/**
 * Serialise a table to an RFC 4180 CSV document.
 *
 * Row order is the caller's. SilkPlot does not sort series data — the marks
 * follow the array they were given — so sorting here would produce a file that
 * disagrees with the chart it came from. The export is faithful rather than
 * tidied, and a spreadsheet sorts trivially.
 */
export function toCsv(table: CsvTable, options: CsvOptions = {}): string {
  const lines: string[] = [];
  if (table.columns !== undefined) {
    lines.push(table.columns.map(csvField).join(","));
  }
  for (const row of table.rows) {
    lines.push(row.map(csvField).join(","));
  }
  // A trailing CRLF is permitted by RFC 4180 and is what most tools emit; it
  // also means a file of N records has N line endings rather than N-1, which is
  // the shape a line-oriented reader expects.
  const body = lines.join(CRLF) + (lines.length > 0 ? CRLF : "");
  return (options.bom ?? true ? UTF8_BOM : "") + body;
}
