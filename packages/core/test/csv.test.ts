/**
 * The CSV serialiser — dialect, and the formula-injection guard.
 *
 * The injection cases are the reason this file is longer than a serialiser
 * usually warrants. A spreadsheet is the stated destination of the export
 * feature, so a cell that executes is not an edge case discovered by a security
 * reviewer — it is the primary path, reached by any dataset whose labels happen
 * to start with a minus sign or an at-symbol.
 *
 * The pairing that matters most is the last one: `-5` must NOT be guarded while
 * `-1+1` must be. Getting that backwards is invisible in a suite that only tests
 * attack strings, and it turns every negative number in every export into text.
 */
import { describe, expect, it } from "vitest";
import { csvField, toCsv, UTF8_BOM } from "../src/index";

describe("csvField — quoting only where the dialect requires it", () => {
  it("leaves an ordinary value unquoted", () => {
    // Quoting everything is valid RFC 4180 and is not done here: an unquoted
    // file is the one a human can read, and some tools import a quoted numeric
    // column as text.
    expect(csvField("Jan")).toBe("Jan");
    expect(csvField(42)).toBe("42");
  });

  it("quotes and doubles an embedded quote", () => {
    expect(csvField('a "quoted" word')).toBe('"a ""quoted"" word"');
  });

  it("quotes an embedded delimiter", () => {
    expect(csvField("Cape Town, WC")).toBe('"Cape Town, WC"');
  });

  it("quotes embedded newlines of either kind", () => {
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("two\r\nlines")).toBe('"two\r\nlines"');
  });

  it("quotes leading and trailing spaces, which a parser would otherwise eat", () => {
    expect(csvField("  padded  ")).toBe('"  padded  "');
  });

  it("renders a null or undefined cell as empty", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("renders a non-finite number as empty rather than as the text NaN", () => {
    // `NaN` and `Infinity` land as TEXT in a numeric column and poison every
    // formula that touches it. An empty cell is what a spreadsheet already means
    // by "no value".
    expect(csvField(Number.NaN)).toBe("");
    expect(csvField(Number.POSITIVE_INFINITY)).toBe("");
    expect(csvField(Number.NEGATIVE_INFINITY)).toBe("");
  });
});

describe("csvField — formula injection", () => {
  // OWASP's list, and the mitigation is OWASP's too: a single-quote prefix.
  // Tab was the older mitigation and was abandoned because it made tab itself a
  // vector — which is why tab appears HERE, in the guarded set.
  const attacks = [
    ["=", "=1+1"],
    ["plus", "+1+1"],
    ["minus", "-1+1"],
    ["at", "@SUM(A1:A9)"],
    ["tab", "\tcmd"],
    ["carriage return", "\rcmd"],
  ] as const;

  for (const [name, payload] of attacks) {
    it(`neutralises a string beginning with ${name}`, () => {
      const field = csvField(payload);
      // The value survives intact behind the prefix; it is not stripped or
      // rewritten, so a parser still recovers what the chart held.
      expect(field.replace(/^"|"$/g, "").startsWith("'")).toBe(true);
      expect(field).toContain(payload.replace(/"/g, '""'));
    });
  }

  it("does NOT guard a negative number, which is not a formula", () => {
    // The pairing this file exists for. `-5` arrived as a JavaScript number and
    // was never text, so it cannot carry a formula — and guarding it would emit
    // `'-5`, turning a numeric column into text in the exact spreadsheet this
    // feature serves.
    expect(csvField(-5)).toBe("-5");
    expect(csvField(-0.25)).toBe("-0.25");
  });

  it("still guards a STRING that looks like a negative number", () => {
    // Text is text. A caller-supplied label of "-5" cannot be distinguished from
    // "-1+1" by inspection, so it takes the guard.
    expect(csvField("-5")).toBe("'-5");
  });
});

describe("toCsv — the document", () => {
  const TABLE = {
    columns: ["Time", "Value"],
    rows: [
      ["2026-03-01T00:00:00.000Z", 3],
      ["2026-03-02T00:00:00.000Z", 11],
    ],
  };

  it("emits a BOM, CRLF line endings, and a header row", () => {
    const csv = toCsv(TABLE);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.slice(UTF8_BOM.length)).toBe(
      "Time,Value\r\n" +
        "2026-03-01T00:00:00.000Z,3\r\n" +
        "2026-03-02T00:00:00.000Z,11\r\n",
    );
  });

  it("omits the BOM on request without changing anything else", () => {
    // The BOM is what makes Excel read UTF-8; every other tool is happier
    // without it, so it is an option rather than a fixture.
    const withBom = toCsv(TABLE);
    const without = toCsv(TABLE, { bom: false });
    expect(without.startsWith(UTF8_BOM)).toBe(false);
    expect(withBom).toBe(UTF8_BOM + without);
  });

  it("writes a headerless file when no columns are given", () => {
    expect(toCsv({ rows: [["a", 1]] }, { bom: false })).toBe("a,1\r\n");
  });

  it("produces an empty document for no rows rather than a stray line ending", () => {
    expect(toCsv({ rows: [] }, { bom: false })).toBe("");
  });

  it("preserves the caller's row order rather than sorting", () => {
    // SilkPlot does not sort series data — the marks follow the array they were
    // given — so a sorted export would disagree with the chart it came from.
    const scrambled = toCsv({ rows: [["c", 3], ["a", 1], ["b", 2]] }, { bom: false });
    expect(scrambled).toBe("c,3\r\na,1\r\nb,2\r\n");
  });

  it("round-trips through a minimal RFC 4180 parser back to the source values", () => {
    const tricky = {
      columns: ["Label", "Value"],
      rows: [
        ['a "quoted" label', 1],
        ["Cape Town, WC", -2],
        ["two\nlines", 3],
      ],
    };
    expect(parseCsv(toCsv(tricky, { bom: false }))).toEqual([
      ["Label", "Value"],
      ['a "quoted" label', "1"],
      ["Cape Town, WC", "-2"],
      ["two\nlines", "3"],
    ]);
  });
});

/**
 * A minimal RFC 4180 reader, written here rather than imported.
 *
 * The round trip is only evidence if the reader is independent of the writer.
 * A shared helper would let one bug cancel the other out and report a pass.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 2;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
