/**
 * `resolveChartSemantics` — the ADR-0005 contract as a pure function.
 *
 * The three-part failure mode is the whole subject here, and the reason the
 * decision lives in a plain function rather than inline in a component: BOTH
 * branches have to be provable. A development-only check tested only in a
 * development build proves half a contract, and the production half — the
 * honest fallback that must never become a silent decorative downgrade — is
 * precisely the half that would ship broken.
 *
 * `ChartDataAlternative` is exercised here too, at the primitive layer, since
 * the composed charts prove only their own wiring of it.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import {
  ChartDataAlternative,
  createChartSemantics,
  resolveChartSemantics,
  FALLBACK_CHART_NAME,
  type ChartSemanticsIssue,
} from "../src/index";

describe("resolveChartSemantics — development builds fail loud", () => {
  it("throws when an informative chart has no name", () => {
    expect(() => resolveChartSemantics({ title: undefined }, { strict: true })).toThrow(
      /accessible name/i,
    );
  });

  it("throws on a whitespace-only name — a blank <title> is an unnamed graphic", () => {
    expect(() => resolveChartSemantics({ title: "   " }, { strict: true })).toThrow(
      /accessible name/i,
    );
  });

  it("names the explicit opt-out in the message, so the fix is not to guess", () => {
    expect(() => resolveChartSemantics({}, { strict: true })).toThrow(/decorative/);
  });

  it("does not throw when named by reference instead of by value", () => {
    const resolved = resolveChartSemantics({ labelledBy: "heading-1" }, { strict: true });
    expect(resolved.decorative).toBe(false);
    expect(resolved.labelledBy).toBe("heading-1");
    expect(resolved.usedFallbackName).toBe(false);
  });

  it("warns rather than throws on a missing description", () => {
    const resolved = resolveChartSemantics({ title: "Bookings" }, { strict: true });
    expect(resolved.issues.map((i) => i.code)).toEqual(["missing-description"]);
  });

  it("accepts any one of the four description channels", () => {
    for (const input of [
      { title: "T", desc: "d" },
      { title: "T", summary: "s" },
      { title: "T", describedBy: "note-1" },
      { title: "T", table: { columns: ["a", "b"] } },
    ]) {
      expect(resolveChartSemantics(input, { strict: true }).issues).toEqual([]);
    }
  });
});

describe("resolveChartSemantics — production degrades honestly, never silently", () => {
  it("returns a fallback name instead of throwing", () => {
    const resolved = resolveChartSemantics({}, { strict: false });
    expect(resolved.name).toBe(FALLBACK_CHART_NAME);
    expect(resolved.usedFallbackName).toBe(true);
  });

  it("reports the missing name as an issue — the fallback is never silent", () => {
    const resolved = resolveChartSemantics({}, { strict: false });
    expect(resolved.issues.map((i) => i.code)).toContain("missing-name");
  });

  it("does NOT downgrade an unnamed informative chart to decorative", () => {
    // The contract's sharpest edge. Hiding the chart would make the warning go
    // away and take the information with it — an unnamed chart is a reportable
    // failure, not a decorative one.
    const resolved = resolveChartSemantics({}, { strict: false });
    expect(resolved.decorative).toBe(false);
  });

  it("still reports a missing description alongside a missing name", () => {
    const codes = resolveChartSemantics({}, { strict: false }).issues.map((i) => i.code);
    expect(codes).toContain("missing-name");
    expect(codes).toContain("missing-description");
  });
});

describe("resolveChartSemantics — decorative is an explicit opt-out", () => {
  it("is clean in both strict and non-strict builds", () => {
    for (const strict of [true, false]) {
      const resolved = resolveChartSemantics({ decorative: true }, { strict });
      expect(resolved.decorative).toBe(true);
      expect(resolved.issues).toEqual([]);
      expect(resolved.name).toBe("");
    }
  });

  it("is not reachable by omission — only `decorative: true` gets there", () => {
    for (const value of [undefined, false]) {
      expect(resolveChartSemantics({ decorative: value }, { strict: false }).decorative).toBe(
        false,
      );
    }
  });
});

describe("createChartSemantics — ids and reactivity", () => {
  it("gives two instances disjoint ids", () => {
    const seen: string[] = [];
    render(() => {
      for (let i = 0; i < 2; i += 1) {
        const sem = createChartSemantics({ title: "T", desc: "d" });
        seen.push(sem.ids.title, sem.ids.desc, sem.ids.summary, sem.ids.table);
      }
      return null;
    });
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("tracks a changing title", () => {
    const [title, setTitle] = createSignal("Before");
    let name = (): string => "";
    render(() => {
      // A getter, not `title: title()`. Solid's props object exposes every prop
      // as a getter, so this is what a JSX caller actually hands over; an
      // eagerly-evaluated literal reads the signal once, outside any tracking
      // scope, and would prove only that the test froze.
      name = createChartSemantics({
        get title() {
          return title();
        },
        desc: "d",
      }).name;
      return null;
    });
    expect(name()).toBe("Before");
    setTitle("After");
    expect(name()).toBe("After");
  });

  it("delivers issues to the diagnostic hook", () => {
    const issues: ChartSemanticsIssue[] = [];
    render(() => {
      createChartSemantics({ title: "Named", onSemanticsIssue: (i) => issues.push(i) });
      return null;
    });
    expect(issues.map((i) => i.code)).toEqual(["missing-description"]);
  });
});

describe("ChartDataAlternative", () => {
  const COLUMNS = ["Month", "Bookings"];

  it("renders nothing when there is no summary and no table", () => {
    const { container } = render(() => {
      const sem = createChartSemantics({ title: "T", desc: "d" });
      return <ChartDataAlternative semantics={sem} />;
    });
    expect(container.querySelector("[data-silkplot-alternative]")).toBeNull();
  });

  it("renders the summary as real HTML with the id the description references", () => {
    const { container } = render(() => {
      const sem = createChartSemantics({ title: "T", summary: "Rose then fell." });
      return <ChartDataAlternative semantics={sem} />;
    });
    const p = container.querySelector("p");
    expect(p?.textContent).toBe("Rose then fell.");
    expect(p?.id.length).toBeGreaterThan(0);
  });

  it("prefers caller-supplied rows over the derived ones", () => {
    const { container } = render(() => {
      const sem = createChartSemantics({
        title: "T",
        table: { columns: COLUMNS, rows: [["Jan", "one thousand"]] },
      });
      return <ChartDataAlternative semantics={sem} defaultRows={() => [["Jan", 1000]]} />;
    });
    expect(container.querySelector("tbody td")?.textContent).toBe("one thousand");
  });

  it("marks the first cell of each row as its row header", () => {
    const { container } = render(() => {
      const sem = createChartSemantics({ title: "T", table: { columns: COLUMNS } });
      return (
        <ChartDataAlternative
          semantics={sem}
          defaultRows={() => [
            ["Jan", 3],
            ["Feb", 11],
          ]}
        />
      );
    });
    expect(
      Array.from(container.querySelectorAll('tbody th[scope="row"]')).map((el) => el.textContent),
    ).toEqual(["Jan", "Feb"]);
    expect(Array.from(container.querySelectorAll("tbody td")).map((el) => el.textContent)).toEqual(
      ["3", "11"],
    );
  });

  it("follows a reactive row source", () => {
    const [rows, setRows] = createSignal<readonly (readonly (string | number)[])[]>([["Jan", 3]]);
    const { container } = render(() => {
      const sem = createChartSemantics({ title: "T", table: { columns: COLUMNS } });
      return <ChartDataAlternative semantics={sem} defaultRows={() => rows()} />;
    });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);

    setRows([
      ["Oct", 400],
      ["Nov", 17],
      ["Dec", 962],
    ]);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(Array.from(container.querySelectorAll("tbody td")).map((el) => el.textContent)).toEqual(
      ["400", "17", "962"],
    );
  });
});
