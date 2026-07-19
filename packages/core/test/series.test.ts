/**
 * The shared series model — ADR-0008's contract, walked.
 *
 * Organised around the failures the contract exists to prevent rather than
 * around the functions it exports, because the functions are easy and the
 * failures are the reason any of this is written down: identity that survives a
 * reorder, a gap that never becomes a zero, a domain that stays finite on input
 * that is entirely broken, and a table that cannot describe a different dataset
 * from the marks.
 *
 * Written DAMP: each case carries its own literal data so the arithmetic is
 * visible without resolving a helper.
 */
import { describe, expect, it, vi } from "vitest";
import {
  fromRows,
  normalizeSeries,
  seriesGeometry,
  seriesSummary,
  seriesTable,
  timeDomainOf,
  valueDomainOf,
} from "../src/index";
import type { Series, SeriesIssue } from "../src/index";

/** Production posture: report rather than throw. */
const LENIENT = { strict: false } as const;

const at = (iso: string): Date => new Date(iso);

const T0 = "2026-03-01T00:00:00.000Z";
const T1 = "2026-03-01T01:00:00.000Z";
const T2 = "2026-03-01T02:00:00.000Z";

function series(id: string, values: readonly (number | null)[], extra: Partial<Series> = {}): Series {
  return {
    id,
    label: id.toUpperCase(),
    data: values.map((y, i) => ({ t: new Date(Date.UTC(2026, 2, 1, i)), y })),
    ...extra,
  };
}

describe("identity (ADR-0008 §1)", () => {
  it("survives a reorder — the failure an array index has and an id does not", () => {
    const a = series("alpha", [1, 2]);
    const b = series("beta", [10, 20]);

    const first = normalizeSeries([a, b], LENIENT);
    const reordered = normalizeSeries([b, a], LENIENT);

    // Same identities, same data attached to each, whatever the position.
    expect(first.byId.get("alpha")?.data.map((d) => d.y)).toEqual([1, 2]);
    expect(reordered.byId.get("alpha")?.data.map((d) => d.y)).toEqual([1, 2]);
    expect(reordered.byId.get("beta")?.data.map((d) => d.y)).toEqual([10, 20]);

    // The POSITION does change, and is reported honestly — it is legend and
    // paint order, which is a presentation fact rather than an identity one.
    expect(first.byId.get("alpha")?.sourceIndex).toBe(0);
    expect(reordered.byId.get("alpha")?.sourceIndex).toBe(1);
  });

  it("retains no record of a removed series", () => {
    const withBoth = normalizeSeries([series("a", [1]), series("b", [2])], LENIENT);
    expect(withBoth.byId.has("b")).toBe(true);

    const withoutB = normalizeSeries([series("a", [1])], LENIENT);
    expect(withoutB.byId.has("b")).toBe(false);
    expect(withoutB.series).toHaveLength(1);
    expect(withoutB.visible).toHaveLength(1);
  });

  it("adds a series to every derived collection at once", () => {
    const model = normalizeSeries([series("a", [1]), series("b", [2]), series("c", [3])], LENIENT);
    expect(model.series).toHaveLength(3);
    expect(model.visible).toHaveLength(3);
    expect(model.byId.size).toBe(3);
    expect(seriesTable(model).columns).toEqual(["Time", "A", "B", "C"]);
    expect(seriesSummary(model).seriesCount).toBe(3);
  });

  it("throws on a duplicate id in development — it is a structural ambiguity", () => {
    expect(() => normalizeSeries([series("dup", [1]), series("dup", [2])], { strict: true }))
      .toThrow(/two series share the id "dup"/);
  });

  it("defaults its posture to the build, with no option passed", () => {
    // No `strict` given: the default is `isDevelopmentBuild()`, and a test run
    // is a development build. This pins the DEFAULT rather than the explicit
    // flag — a contract whose default posture is untested is one that could
    // silently ship lenient.
    expect(() => normalizeSeries([series("dup", [1]), series("dup", [2])]))
      .toThrow(/two series share the id/);
  });

  it("keeps the first occurrence and reports in production", () => {
    const onIssue = vi.fn();
    const model = normalizeSeries([series("dup", [1]), series("dup", [999])], {
      ...LENIENT,
      onIssue,
    });

    expect(model.series).toHaveLength(1);
    expect(model.byId.get("dup")?.data.map((d) => d.y)).toEqual([1]);
    expect(model.issues.map((i: SeriesIssue) => i.code)).toEqual(["duplicate-id"]);
    expect(onIssue).toHaveBeenCalledTimes(1);
  });
});

describe("missing and invalid are different, and neither is zero (ADR-0008 §4)", () => {
  it("classifies null as missing and keeps the value null", () => {
    const model = normalizeSeries([series("s", [1, null, 3])], LENIENT);
    const data = model.byId.get("s")?.data ?? [];

    expect(data.map((d) => d.state)).toEqual(["present", "missing", "present"]);
    expect(data[1]?.y).toBeNull();
    // The assertion this whole contract exists for.
    expect(data[1]?.y).not.toBe(0);
  });

  it("classifies NaN and Infinity as invalid, never as missing and never as zero", () => {
    const model = normalizeSeries([series("s", [1, Number.NaN, Number.POSITIVE_INFINITY, 4])], {
      ...LENIENT,
    });
    const data = model.byId.get("s")?.data ?? [];

    expect(data.map((d) => d.state)).toEqual(["present", "invalid", "invalid", "present"]);
    expect(data[1]?.y).toBeNull();
    expect(data[2]?.y).toBeNull();
    expect(data.some((d) => d.y === 0)).toBe(false);
  });

  it("treats an unparseable instant as invalid, not missing", () => {
    const model = normalizeSeries(
      [{ id: "s", label: "S", data: [{ t: at("nonsense"), y: 5 }, { t: at(T1), y: 6 }] }],
      LENIENT,
    );
    const data = model.byId.get("s")?.data ?? [];

    // The VALUE was fine; the record is still broken, because it has no x.
    expect(data[0]?.state).toBe("invalid");
    expect(data[0]?.y).toBeNull();
    expect(model.issues.map((i) => i.code)).toContain("invalid-time");
  });

  it("survives a `t` that is not a Date at all", () => {
    // An untyped caller — JSON straight off the wire, no revival step — passes
    // a string where the types promise a Date. It must degrade to a gap rather
    // than throw on `.getTime()`, which is what a dashboard needs from one bad
    // record, and it must not be mistaken for a declared absence.
    const untyped = [
      { id: "s", label: "S", data: [{ t: "2026-03-01T00:00:00Z" as unknown as Date, y: 5 }] },
    ];
    const model = normalizeSeries(untyped, LENIENT);

    expect(model.byId.get("s")?.data[0]?.state).toBe("invalid");
    expect(model.byId.get("s")?.data[0]?.y).toBeNull();
    expect(model.issues.map((i) => i.code)).toContain("invalid-time");
  });

  it("reports bad values once per series, not once per datum", () => {
    const onIssue = vi.fn();
    const flood: Series = {
      id: "noisy",
      label: "Noisy",
      data: Array.from({ length: 500 }, (_, i) => ({
        t: new Date(Date.UTC(2026, 2, 1, 0, i)),
        y: Number.NaN,
      })),
    };
    normalizeSeries([flood], { ...LENIENT, onIssue });

    // One message naming 500, not 500 messages.
    expect(onIssue).toHaveBeenCalledTimes(1);
    expect(onIssue.mock.calls[0]?.[0].message).toMatch(/500 non-finite value/);
  });
});

describe("gap policy produces structurally different geometry (ADR-0008 §4)", () => {
  it("break keeps the gap in the array and marks it undrawn", () => {
    const model = normalizeSeries([series("s", [1, null, 3], { nullPolicy: "break" })], LENIENT);
    const geom = seriesGeometry(model.byId.get("s") as never);

    expect(geom.points).toHaveLength(3);
    expect(geom.points.map((d, i) => geom.defined(d, i))).toEqual([true, false, true]);
  });

  it("connect REMOVES the gap so the generator never sees a null", () => {
    const model = normalizeSeries([series("s", [1, null, 3], { nullPolicy: "connect" })], LENIENT);
    const geom = seriesGeometry(model.byId.get("s") as never);

    expect(geom.points).toHaveLength(2);
    expect(geom.points.map((d) => d.y)).toEqual([1, 3]);
    // Every surviving point is drawn, and none of them is null — which is the
    // property that stops a path generator scaling `null` to zero.
    expect(geom.points.every((d, i) => geom.defined(d, i))).toBe(true);
    expect(geom.points.some((d) => d.y === null)).toBe(false);
  });

  it("connect does not draw through an INVALID point either", () => {
    const model = normalizeSeries(
      [series("s", [1, Number.NaN, 3], { nullPolicy: "connect" })],
      LENIENT,
    );
    const geom = seriesGeometry(model.byId.get("s") as never);

    // Removed, not connected through as though it were a known absence.
    expect(geom.points.map((d) => d.y)).toEqual([1, 3]);
  });

  it("the two policies are distinguishable on identical input", () => {
    const input = [1, null, 3] as const;
    const broken = seriesGeometry(
      normalizeSeries([series("s", input, { nullPolicy: "break" })], LENIENT).byId.get("s") as never,
    );
    const joined = seriesGeometry(
      normalizeSeries([series("s", input, { nullPolicy: "connect" })], LENIENT).byId.get(
        "s",
      ) as never,
    );

    expect(broken.points.length).not.toBe(joined.points.length);
  });

  it("defaults to break when no policy is given", () => {
    const model = normalizeSeries([series("s", [1, null, 3])], LENIENT);
    expect(model.byId.get("s")?.nullPolicy).toBe("break");
  });
});

describe("visibility (ADR-0008 §6)", () => {
  const three = [series("a", [1]), series("b", [2]), series("c", [3])];

  it("is uncontrolled when the prop is absent — everything visible", () => {
    const model = normalizeSeries(three, LENIENT);
    expect(model.visible.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("isolates to exactly one", () => {
    const model = normalizeSeries(three, { ...LENIENT, visibleSeries: ["b"] });
    expect(model.visible.map((s) => s.id)).toEqual(["b"]);
    // The hidden ones are still PRESENT, flagged — a legend has to render them.
    expect(model.series.map((s) => s.visible)).toEqual([false, true, false]);
  });

  it("treats the empty array as empty, NOT as no filter", () => {
    const model = normalizeSeries(three, { ...LENIENT, visibleSeries: [] });
    expect(model.visible).toHaveLength(0);
    // The bug this guards: deselecting the last series showing every series.
    expect(model.visible).not.toHaveLength(3);
  });

  it("distinguishes an empty array from undefined", () => {
    const none = normalizeSeries(three, { ...LENIENT, visibleSeries: [] });
    const all = normalizeSeries(three, { ...LENIENT, visibleSeries: undefined });
    expect(none.visible).toHaveLength(0);
    expect(all.visible).toHaveLength(3);
  });

  it("ignores an id that matches no series, without erroring", () => {
    const onIssue = vi.fn();
    const model = normalizeSeries(three, {
      ...LENIENT,
      onIssue,
      visibleSeries: ["b", "decommissioned"],
    });
    expect(model.visible.map((s) => s.id)).toEqual(["b"]);
    expect(onIssue).not.toHaveBeenCalled();
  });
});

describe("domains stay finite on every input (ADR-0008 §7)", () => {
  const finite = (d: readonly [number, number]): boolean =>
    Number.isFinite(d[0]) && Number.isFinite(d[1]);

  it("excludes hidden series from the visible domain and keeps them in the all-series one", () => {
    const model = normalizeSeries([series("small", [1, 2]), series("spike", [1000])], {
      ...LENIENT,
      visibleSeries: ["small"],
    });

    expect(model.valueDomain).toEqual([1, 2]);
    expect(model.allValueDomain).toEqual([1, 1000]);
  });

  it.each([
    ["all positive", [1, 5, 9], [1, 9]],
    ["all negative", [-9, -5, -1], [-9, -1]],
    ["crossing zero", [-4, 0, 7], [-4, 7]],
    ["constant", [5, 5, 5], [5, 5]],
  ] as const)("handles %s", (_name, values, expected) => {
    const model = normalizeSeries([series("s", values)], LENIENT);
    expect(model.valueDomain).toEqual(expected);
    expect(finite(model.valueDomain)).toBe(true);
  });

  it("stays finite when every value is invalid", () => {
    const model = normalizeSeries(
      [series("s", [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])],
      LENIENT,
    );
    expect(finite(model.valueDomain)).toBe(true);
    expect(model.valueDomain).toEqual([0, 1]);
  });

  it("stays finite when the visible set is empty", () => {
    const model = normalizeSeries([series("s", [1, 2])], { ...LENIENT, visibleSeries: [] });
    expect(finite(model.valueDomain)).toBe(true);
    expect(finite(model.timeDomain)).toBe(true);
  });

  it("stays finite on no series at all", () => {
    const model = normalizeSeries([], LENIENT);
    expect(finite(model.valueDomain)).toBe(true);
    expect(finite(model.timeDomain)).toBe(true);
  });

  it("never lets a null floor the domain at zero", () => {
    // The exact regression `extentOf` was written for, now at series level.
    const model = normalizeSeries([series("s", [5, null, 9])], LENIENT);
    expect(model.valueDomain).toEqual([5, 9]);
    expect(model.valueDomain[0]).not.toBe(0);
  });

  it("excludes an invalid instant from the time domain", () => {
    const model = normalizeSeries(
      [
        {
          id: "s",
          label: "S",
          data: [
            { t: at(T0), y: 1 },
            { t: at("nonsense"), y: 2 },
            { t: at(T2), y: 3 },
          ],
        },
      ],
      LENIENT,
    );
    expect(model.timeDomain).toEqual([at(T0).getTime(), at(T2).getTime()]);
  });

  it("exposes the domain helpers over an arbitrary subset", () => {
    const model = normalizeSeries([series("a", [1, 2]), series("b", [10, 20])], LENIENT);
    const onlyB = model.series.filter((s) => s.id === "b");
    expect(valueDomainOf(onlyB)).toEqual([10, 20]);
    expect(timeDomainOf(onlyB)).toEqual([
      Date.UTC(2026, 2, 1, 0),
      Date.UTC(2026, 2, 1, 1),
    ]);
  });
});

describe("order is the caller's (ADR-0008 §5)", () => {
  it("does not sort datums", () => {
    const scrambled: Series = {
      id: "s",
      label: "S",
      data: [
        { t: at(T2), y: 3 },
        { t: at(T0), y: 1 },
        { t: at(T1), y: 2 },
      ],
    };
    const model = normalizeSeries([scrambled], LENIENT);

    // Array order preserved exactly, and the domain still covers the extent
    // rather than reading the first and last element.
    expect(model.byId.get("s")?.data.map((d) => d.y)).toEqual([3, 1, 2]);
    expect(model.timeDomain).toEqual([at(T0).getTime(), at(T2).getTime()]);
  });

  it("keeps both readings at a duplicate instant, in array order", () => {
    const model = normalizeSeries(
      [
        {
          id: "s",
          label: "S",
          data: [
            { t: at(T0), y: 1 },
            { t: at(T0), y: 2 },
          ],
        },
      ],
      LENIENT,
    );
    expect(model.byId.get("s")?.data.map((d) => d.y)).toEqual([1, 2]);
  });

  it("preserves the caller's index through gap filtering", () => {
    const model = normalizeSeries([series("s", [1, null, 3], { nullPolicy: "connect" })], LENIENT);
    const geom = seriesGeometry(model.byId.get("s") as never);
    // The surviving points still know where they came from, which is what lets
    // an activation callback point back into the caller's own array.
    expect(geom.points.map((d) => d.sourceIndex)).toEqual([0, 2]);
  });

  it("does not mutate the caller's input", () => {
    const input = [series("s", [1, null, 3])];
    const snapshot = JSON.stringify(input);
    normalizeSeries(input, { ...LENIENT, visibleSeries: [] });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("metadata survives normalisation (ADR-0008 §3)", () => {
  interface Reading {
    serial: string;
  }

  it("returns meta verbatim on present datums", () => {
    const input: Series<Reading>[] = [
      {
        id: "probe",
        label: "Probe",
        data: [{ t: at(T0), y: 18.2, meta: { serial: "PA-99120" } }],
      },
    ];
    const model = normalizeSeries(input, LENIENT);
    expect(model.byId.get("probe")?.data[0]?.meta).toEqual({ serial: "PA-99120" });
  });

  it("keeps meta on a MISSING datum — the gap is still a record", () => {
    const input: Series<Reading>[] = [
      {
        id: "probe",
        label: "Probe",
        data: [{ t: at(T0), y: null, meta: { serial: "PA-99120" } }],
      },
    ];
    const model = normalizeSeries(input, LENIENT);
    // A tooltip over a gap can still say which sensor failed to report, which
    // is frequently the most useful thing on the chart.
    expect(model.byId.get("probe")?.data[0]?.meta).toEqual({ serial: "PA-99120" });
    expect(model.byId.get("probe")?.data[0]?.y).toBeNull();
  });
});

describe("the table describes the same model the marks are drawn from", () => {
  it("shows only visible series", () => {
    const model = normalizeSeries([series("a", [1]), series("b", [2])], {
      ...LENIENT,
      visibleSeries: ["a"],
    });
    const table = seriesTable(model);
    expect(table.columns).toEqual(["Time", "A"]);
    expect(table.rows[0]).toEqual([T0, 1]);
  });

  it("renders a gap as an empty cell, never as zero", () => {
    const model = normalizeSeries([series("s", [1, null, 3])], LENIENT);
    const table = seriesTable(model);
    expect(table.rows.map((r) => r[1])).toEqual([1, "", 3]);
    expect(table.rows.map((r) => r[1])).not.toContain(0);
  });

  it("unions instants across series that do not share timestamps", () => {
    const a: Series = { id: "a", label: "A", data: [{ t: at(T0), y: 1 }] };
    const b: Series = { id: "b", label: "B", data: [{ t: at(T2), y: 2 }] };
    const table = seriesTable(normalizeSeries([a, b], LENIENT));

    expect(table.rows).toEqual([
      [T0, 1, ""],
      [T2, "", 2],
    ]);
  });

  it("orders rows ascending regardless of the caller's array order", () => {
    const scrambled: Series = {
      id: "s",
      label: "S",
      data: [
        { t: at(T2), y: 3 },
        { t: at(T0), y: 1 },
      ],
    };
    const table = seriesTable(normalizeSeries([scrambled], LENIENT));
    expect(table.rows.map((r) => r[0])).toEqual([T0, T2]);
  });

  it("omits an invalid datum from the table entirely", () => {
    const model = normalizeSeries([series("s", [1, Number.NaN, 3])], LENIENT);
    const table = seriesTable(model);
    // Two rows, not three: a record with no usable value and no reason to
    // occupy a row a reader has to scan past.
    expect(table.rows).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Caller formatting (ADR-0008 §9)                                             */
/* -------------------------------------------------------------------------- */

describe("seriesTable formatting", () => {
  it("defaults to ISO 8601 instants and unadorned numbers", () => {
    const table = seriesTable(normalizeSeries([series("s", [1])], LENIENT));
    // The generic default §9 promises, asserted so a formatter landing on the
    // no-options path would be caught rather than silently becoming the default.
    expect(table.rows[0]?.[0]).toBe(T0);
    expect(table.rows[0]?.[1]).toBe(1);
  });

  it("applies a caller time format to the instant column", () => {
    const table = seriesTable(normalizeSeries([series("s", [1])], LENIENT), {
      time: (t) => `hour ${t.getUTCHours()}`,
    });
    expect(table.rows[0]?.[0]).toBe("hour 0");
  });

  it("hands the time formatter a Date, never the library's own ISO string", () => {
    // The whole reason the option takes a `Date`: a caller reformatting must not
    // have to parse the string this function would otherwise have produced.
    const seen: unknown[] = [];
    seriesTable(normalizeSeries([series("s", [1])], LENIENT), {
      time: (t) => {
        seen.push(t);
        return "x";
      },
    });
    expect(seen[0]).toBeInstanceOf(Date);
    expect((seen[0] as Date).toISOString()).toBe(T0);
  });

  it("applies a caller value format to a present reading", () => {
    const table = seriesTable(normalizeSeries([series("s", [1, 2])], LENIENT), {
      value: (y) => `${y} u`,
    });
    expect(table.rows.map((r) => r[1])).toEqual(["1 u", "2 u"]);
  });

  it("never calls the value formatter for a gap, and leaves the cell empty", () => {
    // The failure this prevents is a unit printed against a reading nobody took
    // — "0 u", or " u", in a cell that means "no value".
    const calls: number[] = [];
    const table = seriesTable(normalizeSeries([series("s", [1, null, 3])], LENIENT), {
      value: (y) => {
        calls.push(y);
        return `${y} u`;
      },
    });
    expect(table.rows.map((r) => r[1])).toEqual(["1 u", "", "3 u"]);
    expect(calls).toEqual([1, 3]);
  });

  it("gives each cell ITS OWN series label, not the first one's", () => {
    // A chart carrying a rate and a total needs one formatter to tell them
    // apart. Indexing back into the series array is how that silently goes
    // wrong, so the pairing is asserted across a row rather than assumed.
    const a: Series = { id: "a", label: "Celsius", data: [{ t: at(T0), y: 20 }] };
    const b: Series = { id: "b", label: "Percent", data: [{ t: at(T0), y: 60 }] };
    const table = seriesTable(normalizeSeries([a, b], LENIENT), {
      value: (y, label) => `${y} ${label}`,
    });
    expect(table.rows[0]).toEqual([T0, "20 Celsius", "60 Percent"]);
  });

  it("keeps a returned number a number, so an export stays numeric", () => {
    // `string | number` exists precisely so display formatting need not commit
    // the CSV to text. A formatter that rounds must still yield a number.
    const table = seriesTable(normalizeSeries([series("s", [1.234])], LENIENT), {
      value: (y) => Math.round(y * 10) / 10,
    });
    expect(table.rows[0]?.[1]).toBe(1.2);
    expect(typeof table.rows[0]?.[1]).toBe("number");
  });

  it("formats only visible series' cells", () => {
    const calls: string[] = [];
    seriesTable(
      normalizeSeries([series("a", [1]), series("b", [2])], {
        ...LENIENT,
        visibleSeries: ["a"],
      }),
      {
        value: (y, label) => {
          calls.push(label);
          return y;
        },
      },
    );
    expect(calls).toEqual(["A"]);
  });
});

describe("summary counts what is on screen", () => {
  it("counts present, missing, and invalid separately over visible series", () => {
    const model = normalizeSeries(
      [series("a", [1, null, Number.NaN]), series("b", [5])],
      { ...LENIENT, visibleSeries: ["a"] },
    );
    expect(seriesSummary(model)).toEqual({
      seriesCount: 2,
      visibleCount: 1,
      pointCount: 1,
      missingCount: 1,
      invalidCount: 1,
    });
  });
});

describe("the row-oriented adapter (ADR-0008 §2)", () => {
  const rows = [
    { time: at(T0), inlet: 21.4, outlet: 24.9 },
    { time: at(T1), inlet: 21.9, outlet: 25.2 },
  ];

  it("pivots wide rows into series keyed by column", () => {
    const built = fromRows(rows, { t: "time", values: ["inlet", "outlet"] });
    expect(built.map((s) => s.id)).toEqual(["inlet", "outlet"]);
    expect(built[0]?.data.map((d) => d.y)).toEqual([21.4, 21.9]);
  });

  it("attaches the whole row as meta so unplotted columns stay reachable", () => {
    const built = fromRows(rows, { t: "time", values: ["inlet"] });
    expect(built[0]?.data[0]?.meta).toEqual(rows[0]);
  });

  it("turns a non-numeric cell into a declared absence, not a zero", () => {
    const sparse = [{ time: at(T0), inlet: "" as unknown as number }];
    const built = fromRows(sparse, { t: "time", values: ["inlet"] });
    // `Number("")` is 0. That coercion is the defect; this asserts its absence.
    expect(built[0]?.data[0]?.y).toBeNull();
    expect(built[0]?.data[0]?.y).not.toBe(0);
  });

  it("accepts an ISO string instant — the shape JSON actually arrives in", () => {
    // The primary case rather than an edge one: a fetch response has no Date
    // objects in it, so a wide row's timestamp is a string until something
    // revives it. The adapter is that something.
    const jsonRows = [
      { time: "2026-03-01T00:00:00.000Z", inlet: 21.4 },
      { time: "2026-03-01T01:00:00.000Z", inlet: 21.9 },
    ];
    const built = fromRows(jsonRows, { t: "time", values: ["inlet"] });
    const model = normalizeSeries(built, LENIENT);

    expect(model.byId.get("inlet")?.data.every((d) => d.state === "present")).toBe(true);
    expect(model.timeDomain).toEqual([at(T0).getTime(), at(T1).getTime()]);
  });

  it("carries labels and gap policy through", () => {
    const built = fromRows(rows, {
      t: "time",
      values: ["inlet"],
      labels: { inlet: "Inlet temperature" },
      nullPolicy: { inlet: "connect" },
    });
    expect(built[0]?.label).toBe("Inlet temperature");
    expect(built[0]?.nullPolicy).toBe("connect");
  });

  it("round-trips into a normalised model", () => {
    const model = normalizeSeries(fromRows(rows, { t: "time", values: ["inlet", "outlet"] }), LENIENT);
    expect(model.visible).toHaveLength(2);
    expect(model.valueDomain).toEqual([21.4, 25.2]);
  });
});
