/**
 * createSeriesModel — the reactive regressions the pure model cannot show.
 *
 * `core`'s suite already walks the normalisation exhaustively, and repeating it
 * here would be duplication that measures nothing. What is provable ONLY in a
 * mounted component is the property this layer exists for: that every derived
 * collection tracks the SAME replacement, in the same update, and that none of
 * them holds a dataset the others have moved past.
 *
 * The organising trap: a chart whose data is captured once still renders
 * perfectly. It does not throw, it does not blank — it silently keeps drawing
 * the first dataset it ever saw. So each test below asserts the state AFTER a
 * change, having first asserted the state before it, because an assertion that
 * only checks the end state passes just as happily against a frozen model.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { createSeriesModel } from "../src/index";
import type { Series } from "@silkplot/core";

const at = (hour: number): Date => new Date(Date.UTC(2026, 2, 1, hour));

const point = (hour: number, y: number | null) => ({ t: at(hour), y });

function series(id: string, values: readonly (number | null)[]): Series {
  return { id, label: id.toUpperCase(), data: values.map((y, i) => point(i, y)) };
}

/**
 * Mount the model and expose every derived collection as text.
 *
 * Rendered rather than inspected directly, because the question is whether a
 * RENDERED consumer re-reads on change — which is what a component does and
 * what calling an accessor in a test body does not necessarily prove.
 */
function mount(
  initial: readonly Series[],
  initialVisible?: readonly string[] | undefined,
) {
  const [data, setData] = createSignal<readonly Series[]>(initial);
  const [visible, setVisible] = createSignal<readonly string[] | undefined>(initialVisible);

  const result = render(() => {
    const m = createSeriesModel({ series: data, visibleSeries: visible });
    return (
      <div>
        <span data-testid="ids">{m.visible().map((s) => s.id).join(",")}</span>
        <span data-testid="all-ids">{m.model().series.map((s) => s.id).join(",")}</span>
        <span data-testid="value-domain">{m.valueDomain().join("..")}</span>
        <span data-testid="counts">
          {m.summary().visibleCount}/{m.summary().seriesCount}:{m.summary().pointCount}
        </span>
        <span data-testid="table-cols">{m.table().columns.join(",")}</span>
        <span data-testid="table-rows">{String(m.table().rows.length)}</span>
        <span data-testid="first-values">
          {m.visible()[0]?.data.map((d) => (d.y === null ? "-" : d.y)).join(",") ?? ""}
        </span>
        <span data-testid="time-domain">
          {m.timeDomain().map((ms) => new Date(ms).toISOString()).join("..")}
        </span>
        <span data-testid="issues">{m.issues().map((i) => i.code).join(",")}</span>
      </div>
    );
  });

  const read = (id: string): string => result.getByTestId(id).textContent ?? "";
  return { read, setData, setVisible, ...result };
}

describe("immutable replacement", () => {
  it("moves every derived collection to the new dataset in one update", () => {
    const { read, setData } = mount([series("a", [1, 2, 3])]);

    expect(read("first-values")).toBe("1,2,3");
    expect(read("value-domain")).toBe("1..3");
    expect(read("table-rows")).toBe("3");

    // A replacement whose values are NOT a uniform rescale of the first, and
    // with a different length — a frozen model cannot coincidentally match it.
    setData([series("a", [40, 5, 90, 12])]);

    expect(read("first-values")).toBe("40,5,90,12");
    expect(read("value-domain")).toBe("5..90");
    expect(read("table-rows")).toBe("4");
  });

  it("carries a replacement into the table and the summary together", () => {
    const { read, setData } = mount([series("a", [1, 2])]);
    expect(read("counts")).toBe("1/1:2");

    setData([series("a", [1, null, 3, 4])]);

    // Table rows, present-point count, and the values themselves all moved.
    // Any one of them lagging is the disagreement this layer prevents.
    expect(read("counts")).toBe("1/1:3");
    expect(read("table-rows")).toBe("4");
    expect(read("first-values")).toBe("1,-,3,4");
  });
});

describe("progressive growth", () => {
  it("extends the domain as pages arrive", () => {
    const { read, setData } = mount([series("a", [10, 20])]);
    expect(read("value-domain")).toBe("10..20");

    setData([series("a", [10, 20, 5, 80])]);
    expect(read("value-domain")).toBe("5..80");

    setData([series("a", [10, 20, 5, 80, 200])]);
    expect(read("value-domain")).toBe("5..200");
  });
});

describe("cardinality", () => {
  it("adds a series to every collection at once", () => {
    const { read, setData } = mount([series("a", [1])]);
    expect(read("all-ids")).toBe("a");
    expect(read("table-cols")).toBe("Time,A");

    setData([series("a", [1]), series("b", [2])]);

    expect(read("all-ids")).toBe("a,b");
    expect(read("ids")).toBe("a,b");
    expect(read("table-cols")).toBe("Time,A,B");
    expect(read("counts")).toBe("2/2:2");
  });

  it("removes a series without leaving a stale record anywhere", () => {
    const { read, setData } = mount([series("a", [1]), series("b", [2])]);
    expect(read("table-cols")).toBe("Time,A,B");

    setData([series("a", [1])]);

    expect(read("all-ids")).toBe("a");
    expect(read("ids")).toBe("a");
    // The removed series' COLUMN is the tell: a retained record would keep
    // rendering a column with no data behind it.
    expect(read("table-cols")).toBe("Time,A");
    expect(read("counts")).toBe("1/1:1");
  });

  it("scales to the dense operational case without a limit", () => {
    const many = Array.from({ length: 22 }, (_, i) => series(`sensor-${i + 1}`, [i]));
    const { read } = mount(many);

    expect(read("counts")).toBe("22/22:22");
    expect(read("table-cols").split(",")).toHaveLength(23);
  });
});

describe("reorder does not disturb identity", () => {
  it("keeps each series' data with its id when positions swap", () => {
    const a = series("a", [1, 2]);
    const b = series("b", [50, 60]);
    const { read, setData } = mount([a, b]);

    expect(read("ids")).toBe("a,b");
    expect(read("first-values")).toBe("1,2");

    setData([b, a]);

    // Order changed — that is legend and paint order, and it is honest.
    expect(read("ids")).toBe("b,a");
    // Identity did not: `b` still carries b's values, in first position.
    expect(read("first-values")).toBe("50,60");
    expect(read("value-domain")).toBe("1..60");
  });
});

describe("visibility is controlled state", () => {
  it("narrows the domain, the table, and the summary together", () => {
    const { read, setVisible } = mount(
      [series("small", [1, 2]), series("spike", [1000, 1])],
      undefined,
    );

    expect(read("value-domain")).toBe("1..1000");
    expect(read("table-cols")).toBe("Time,SMALL,SPIKE");

    setVisible(["small"]);

    // The axis follows the visible marks (ADR-0008 §7) — this is the whole
    // reason an operator hides a spiking series.
    expect(read("value-domain")).toBe("1..2");
    expect(read("table-cols")).toBe("Time,SMALL");
    expect(read("counts")).toBe("1/2:2");
  });

  it("treats the empty set as empty and recovers from it", () => {
    const { read, setVisible } = mount([series("a", [1, 2])], undefined);
    expect(read("ids")).toBe("a");

    setVisible([]);
    expect(read("ids")).toBe("");
    expect(read("table-cols")).toBe("Time");
    // The bug: an empty selection reading as "no filter" and showing everything.
    expect(read("counts")).toBe("0/1:0");

    setVisible(["a"]);
    expect(read("ids")).toBe("a");
  });

  it("distinguishes an empty selection from reverting to uncontrolled", () => {
    const { read, setVisible } = mount([series("a", [1]), series("b", [2])], []);
    expect(read("ids")).toBe("");

    setVisible(undefined);
    expect(read("ids")).toBe("a,b");
  });

  it("ignores an id whose series has been removed mid-replacement", () => {
    const { read, setData } = mount([series("a", [1]), series("b", [2])], ["a", "b"]);
    expect(read("ids")).toBe("a,b");

    // Data drops `b` while visibility still names it — the ordinary out-of-step
    // moment during a replacement. It must be a non-event, not a crash.
    setData([series("a", [1])]);
    expect(read("ids")).toBe("a");
  });
});

describe("empty to populated", () => {
  it("recovers from no series at all", () => {
    const { read, setData } = mount([]);

    expect(read("ids")).toBe("");
    expect(read("table-rows")).toBe("0");
    // Finite even with nothing to describe — a scale still has to be built.
    expect(read("value-domain")).toBe("0..1");

    setData([series("a", [7, 9])]);

    expect(read("ids")).toBe("a");
    expect(read("value-domain")).toBe("7..9");
    expect(read("table-rows")).toBe("2");
  });

  it("recovers from a series with an empty data array", () => {
    const { read, setData } = mount([{ id: "a", label: "A", data: [] }]);
    expect(read("table-rows")).toBe("0");
    expect(read("counts")).toBe("1/1:0");

    setData([series("a", [3, 4])]);
    expect(read("counts")).toBe("1/1:2");
  });
});

describe("the time domain tracks the same replacement", () => {
  it("widens as later instants arrive", () => {
    const { read, setData } = mount([series("a", [1, 2])]);
    expect(read("time-domain")).toBe(
      `${at(0).toISOString()}..${at(1).toISOString()}`,
    );

    setData([series("a", [1, 2, 3, 4])]);
    expect(read("time-domain")).toBe(
      `${at(0).toISOString()}..${at(3).toISOString()}`,
    );
  });

  it("narrows to the visible series", () => {
    const short: Series = { id: "short", label: "SHORT", data: [point(0, 1)] };
    const long: Series = { id: "long", label: "LONG", data: [point(0, 1), point(9, 2)] };
    const { read, setVisible } = mount([short, long], undefined);

    expect(read("time-domain")).toBe(`${at(0).toISOString()}..${at(9).toISOString()}`);

    setVisible(["short"]);
    // A zero-width domain — one instant — and still finite, which is what a
    // scale needs. The axis describes what is drawn, not what was hidden.
    expect(read("time-domain")).toBe(`${at(0).toISOString()}..${at(0).toISOString()}`);
  });
});

describe("diagnostics surface through the reactive layer", () => {
  it("reports a non-finite value and clears the issue when the data is replaced", () => {
    const { read, setData } = mount([series("a", [1, Number.NaN, 3])]);
    expect(read("issues")).toBe("invalid-value");

    // The issue list is derived, not accumulated — a repaired dataset must not
    // keep reporting a fault the current data does not have.
    setData([series("a", [1, 2, 3])]);
    expect(read("issues")).toBe("");
  });

  it("reports an unparseable instant distinctly from a bad value", () => {
    const broken: Series = {
      id: "a",
      label: "A",
      data: [{ t: new Date("nonsense"), y: 1 }],
    };
    const { read } = mount([broken]);
    expect(read("issues")).toBe("invalid-time");
  });
});

describe("gaps never become zeroes through the reactive layer", () => {
  it("keeps a null null across a replacement", () => {
    const { read, setData } = mount([series("a", [5, 6])]);
    expect(read("first-values")).toBe("5,6");

    setData([series("a", [5, null, 6])]);

    // Rendered as the gap marker, not as 0 — and the domain does not drop to
    // zero either, which is the visible consequence of a zero-fill.
    expect(read("first-values")).toBe("5,-,6");
    expect(read("value-domain")).toBe("5..6");
  });
});
