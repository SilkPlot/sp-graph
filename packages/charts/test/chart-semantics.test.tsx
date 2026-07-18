/**
 * The ADR-0005 semantics contract, across all four chart families.
 *
 * Five things are proved for each of Line, Area, Bar, and Scatter, because a
 * contract honoured by one composed chart and quietly missing from another is
 * exactly the failure this phase exists to close:
 *
 *   - computed name — an informative chart reaches the tree named, not as a
 *     bare `role="img"` a screen reader announces as "graphic";
 *   - computed description — the `<desc>` channel actually arrives, which it
 *     could not before: `SvgLayer` supported it and `CartesianFrame` did not
 *     forward it, so the chain was broken one level above the primitive;
 *   - decorative mode — reachable only through the explicit opt-out, and then
 *     genuinely absent from the accessibility tree;
 *   - multiple charts — two charts on one page do not collide on ids, which
 *     matters because every relationship here is an id reference and a
 *     duplicate silently points at the wrong chart;
 *   - replacement data — the semantic content follows the same data swap the
 *     marks follow.
 *
 * On the name assertions: a browser's real accessibility tree is not reachable
 * from vitest browser mode, so `computedName` implements the early steps of
 * accname resolution for this narrow case. It is named as the approximation it
 * is rather than dressed up as an AT result.
 *
 * The replacement cases use THREE points with non-proportional changes. Two
 * points under `extent` occupy the same two pixels whatever their values, and a
 * uniform rescale maps to identical pixels under `zero-floor` — a test built on
 * either cannot tell live content from frozen content and will not say so.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal, type JSX } from "solid-js";
import { render } from "@solidjs/testing-library";
import { AreaChart, BarChart, LineChart, ScatterChart } from "../src/index";
import type { CategoryPoint, TimePoint, XYPoint } from "../src/index";

const W = 400;
const H = 300;

const NAME = "Quarterly bookings";
const DESC = "Bookings from January to March 2026, rising from 3 to 11 then falling to 5.";
const SUMMARY = "Bookings peaked in February at 11 and closed the quarter at 5.";
const COLUMNS = ["Period", "Bookings"] as const;

const TIME_BEFORE: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 3 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 11 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 5 },
];
const TIME_AFTER: TimePoint[] = [
  { t: new Date(Date.UTC(2026, 0, 1)), y: 400 },
  { t: new Date(Date.UTC(2026, 0, 2)), y: 17 },
  { t: new Date(Date.UTC(2026, 0, 3)), y: 962 },
];

const BAND_BEFORE: CategoryPoint[] = [
  { label: "Jan", y: 3 },
  { label: "Feb", y: 11 },
  { label: "Mar", y: 5 },
];
const BAND_AFTER: CategoryPoint[] = [
  { label: "Oct", y: 400 },
  { label: "Nov", y: 17 },
  { label: "Dec", y: 962 },
];

const XY_BEFORE: XYPoint[] = [
  { x: 1, y: 3 },
  { x: 2, y: 11 },
  { x: 3, y: 5 },
];
const XY_AFTER: XYPoint[] = [
  { x: 10, y: 400 },
  { x: 25, y: 17 },
  { x: 40, y: 962 },
];

/** The optional semantic inputs a test varies; the name is always supplied. */
interface Extras {
  desc?: string;
  summary?: string;
  table?: { columns: readonly string[]; rows?: readonly (readonly (string | number)[])[]; caption?: string };
  describedBy?: string;
  tableHidden?: boolean;
  onSemanticsIssue?: (issue: { code: string; message: string }) => void;
}

interface Family {
  label: string;
  /** An informative render, named, with whatever extras the case needs. */
  named: (extras?: Extras) => JSX.Element;
  /**
   * An informative render with NO name. Only constructible behind a
   * `@ts-expect-error`, which is itself half the assertion: the type system
   * refuses this state, and the runtime backstop catches the plain-JS caller
   * who reaches it anyway.
   */
  unnamed: () => JSX.Element;
  /** The explicit decorative opt-out. */
  decorative: () => JSX.Element;
  /**
   * A mounted chart whose data can be swapped. Returns the node plus the swap,
   * and the value column each dataset implies.
   */
  replaceable: () => {
    node: () => JSX.Element;
    swap: () => void;
    valuesBefore: string[];
    valuesAfter: string[];
    labelsAfter: string[];
  };
}

/**
 * The replacement fixture, which was the bulk of what the four entries repeated:
 * a signal, a node reading it, the swap, and the three expectation arrays.
 *
 * Only this part is factored. `named`, `unnamed`, and `decorative` stay written
 * out per family below, because each is one line and because `unnamed` carries a
 * `@ts-expect-error` that is half the assertion — the directive only passes if
 * the compiler genuinely rejects that JSX, proving per chart that "informative
 * and unnamed" is unrepresentable. Routed through a shared loosely-typed
 * component parameter the checker would raise nothing, the directive would
 * become an unused suppression, and the compile-time half of the contract would
 * be gone without a single test turning red.
 *
 * `node` takes the JSX as a callback so the real component and its real prop
 * types stay at the call site; nothing here is cast.
 */
function replaceableFrom<D>(
  before: readonly D[],
  after: readonly D[],
  labelsAfter: string[],
  node: (data: () => readonly D[]) => JSX.Element,
): ReturnType<Family["replaceable"]> {
  const [data, setData] = createSignal<readonly D[]>(before);
  return {
    node: () => node(data),
    swap: () => setData(() => after),
    valuesBefore: ["3", "11", "5"],
    valuesAfter: ["400", "17", "962"],
    labelsAfter,
  };
}

const ISO_AFTER = TIME_AFTER.map((d) => d.t.toISOString());
const TABLE = { columns: COLUMNS } as const;

const FAMILIES: Family[] = [
  {
    label: "LineChart",
    named: (extras = {}) => (
      <LineChart data={TIME_BEFORE} width={W} height={H} title={NAME} {...extras} />
    ),
    unnamed: () => (
      // @ts-expect-error informative-and-unnamed is not a representable state
      <LineChart data={TIME_BEFORE} width={W} height={H} />
    ),
    decorative: () => <LineChart data={TIME_BEFORE} width={W} height={H} decorative />,
    replaceable: () =>
      replaceableFrom(TIME_BEFORE, TIME_AFTER, ISO_AFTER, (data) => (
        <LineChart data={data()} width={W} height={H} title={NAME} table={TABLE} />
      )),
  },
  {
    label: "AreaChart",
    named: (extras = {}) => (
      <AreaChart data={TIME_BEFORE} width={W} height={H} title={NAME} {...extras} />
    ),
    unnamed: () => (
      // @ts-expect-error informative-and-unnamed is not a representable state
      <AreaChart data={TIME_BEFORE} width={W} height={H} />
    ),
    decorative: () => <AreaChart data={TIME_BEFORE} width={W} height={H} decorative />,
    replaceable: () =>
      replaceableFrom(TIME_BEFORE, TIME_AFTER, ISO_AFTER, (data) => (
        <AreaChart data={data()} width={W} height={H} title={NAME} table={TABLE} />
      )),
  },
  {
    label: "BarChart",
    named: (extras = {}) => (
      <BarChart data={BAND_BEFORE} width={W} height={H} title={NAME} {...extras} />
    ),
    unnamed: () => (
      // @ts-expect-error informative-and-unnamed is not a representable state
      <BarChart data={BAND_BEFORE} width={W} height={H} />
    ),
    decorative: () => <BarChart data={BAND_BEFORE} width={W} height={H} decorative />,
    replaceable: () =>
      replaceableFrom(BAND_BEFORE, BAND_AFTER, ["Oct", "Nov", "Dec"], (data) => (
        <BarChart data={data()} width={W} height={H} title={NAME} table={TABLE} />
      )),
  },
  {
    label: "ScatterChart",
    named: (extras = {}) => (
      <ScatterChart data={XY_BEFORE} width={W} height={H} title={NAME} {...extras} />
    ),
    unnamed: () => (
      // @ts-expect-error informative-and-unnamed is not a representable state
      <ScatterChart data={XY_BEFORE} width={W} height={H} />
    ),
    decorative: () => <ScatterChart data={XY_BEFORE} width={W} height={H} decorative />,
    replaceable: () =>
      replaceableFrom(XY_BEFORE, XY_AFTER, ["10", "25", "40"], (data) => (
        <ScatterChart data={data()} width={W} height={H} title={NAME} table={TABLE} />
      )),
  },
];

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (svg === null) throw new Error("no <svg> rendered");
  return svg as SVGSVGElement;
}

/**
 * The accessible name of an `<svg role="img">`, resolved the way accname's
 * early steps do for this narrow case: `aria-labelledby` first, then
 * `aria-label`, then the SVG `<title>` child.
 */
function computedName(svg: SVGSVGElement): string {
  const labelledBy = svg.getAttribute("aria-labelledby");
  if (labelledBy !== null) return textOfIdRefs(svg, labelledBy);
  const label = svg.getAttribute("aria-label");
  if (label !== null) return label.trim();
  return svg.querySelector("title")?.textContent?.trim() ?? "";
}

/** The same resolution for `aria-describedby`, which may reference several nodes. */
function computedDescription(svg: SVGSVGElement): string {
  const describedBy = svg.getAttribute("aria-describedby");
  return describedBy === null ? "" : textOfIdRefs(svg, describedBy);
}

/**
 * Concatenated text of an ID-reference list, the way accname flattens one.
 *
 * Both relationships are space-separated ID lists resolved identically, which is
 * the step that makes a duplicate id dangerous: it silently resolves to a
 * neighbour's node rather than failing.
 */
function textOfIdRefs(svg: SVGSVGElement, idRefs: string): string {
  return idRefs
    .split(/\s+/)
    .map((id) => svg.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
    .filter((text) => text.length > 0)
    .join(" ");
}

/** Every value cell of the rendered data table, row-major. */
function tableValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("tbody td")).map(
    (cell) => cell.textContent?.trim() ?? "",
  );
}

/** Every row-header cell of the rendered data table. */
function tableLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('tbody th[scope="row"]')).map(
    (cell) => cell.textContent?.trim() ?? "",
  );
}

for (const family of FAMILIES) {
  describe(`${family.label} — computed name`, () => {
    it("resolves to the supplied title, not a bare graphic", () => {
      const { container } = render(() => family.named({ desc: DESC }));
      expect(computedName(svgOf(container))).toBe(NAME);
    });

    it("names the chart by id reference rather than by <title> text alone", () => {
      // `<title>` on its own is not a dependable accessible name across screen
      // readers. The explicit aria-labelledby is what makes it dependable, so
      // assert the relationship exists and lands on the right element.
      const { container } = render(() => family.named({ desc: DESC }));
      const svg = svgOf(container);
      const id = svg.getAttribute("aria-labelledby");
      expect(id).not.toBeNull();
      const target = svg.ownerDocument.getElementById(id as string);
      expect(target).not.toBeNull();
      expect(target?.tagName.toLowerCase()).toBe("title");
      expect(target?.textContent).toBe(NAME);
    });

    it("throws in a development build when an informative chart has no name", () => {
      expect(() => render(() => family.unnamed())).toThrow(/accessible name/i);
    });
  });

  describe(`${family.label} — computed description`, () => {
    it("exposes the desc through aria-describedby (the chain CartesianFrame used to break)", () => {
      const { container } = render(() => family.named({ desc: DESC }));
      expect(computedDescription(svgOf(container))).toContain(DESC);
    });

    it("renders the desc as an SVG <desc> carrying the referenced id", () => {
      const { container } = render(() => family.named({ desc: DESC }));
      const svg = svgOf(container);
      const desc = svg.querySelector("desc");
      expect(desc?.textContent).toBe(DESC);
      expect(svg.getAttribute("aria-describedby")?.split(/\s+/)).toContain(desc?.id);
    });

    it("concatenates the narrative summary into the description", () => {
      const { container } = render(() => family.named({ desc: DESC, summary: SUMMARY }));
      const described = computedDescription(svgOf(container));
      expect(described).toContain(DESC);
      expect(described).toContain(SUMMARY);
    });

    it("reports a missing description rather than accepting hidden axes with nothing carrying them", () => {
      const issues: { code: string }[] = [];
      render(() => family.named({ onSemanticsIssue: (issue) => issues.push(issue) }));
      expect(issues.map((i) => i.code)).toContain("missing-description");
    });

    it("raises no issue once a description channel exists", () => {
      const issues: { code: string }[] = [];
      render(() => family.named({ desc: DESC, onSemanticsIssue: (issue) => issues.push(issue) }));
      expect(issues).toEqual([]);
    });
  });

  describe(`${family.label} — decorative mode`, () => {
    it("is absent from the accessibility tree", () => {
      const { container } = render(() => family.decorative());
      const svg = svgOf(container);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("role")).toBe("presentation");
    });

    it("carries no name, description, or relationship attributes", () => {
      const { container } = render(() => family.decorative());
      const svg = svgOf(container);
      expect(svg.querySelector("title")).toBeNull();
      expect(svg.querySelector("desc")).toBeNull();
      expect(svg.getAttribute("aria-labelledby")).toBeNull();
      expect(svg.getAttribute("aria-describedby")).toBeNull();
      expect(svg.getAttribute("aria-details")).toBeNull();
    });

    it("renders no data alternative", () => {
      const { container } = render(() => family.decorative());
      expect(container.querySelector("table")).toBeNull();
      expect(container.querySelector("[data-silkplot-alternative]")).toBeNull();
    });

    it("still renders its marks — decorative hides semantics, not pixels", () => {
      const { container } = render(() => family.decorative());
      expect(svgOf(container).querySelector("g")).not.toBeNull();
    });

    it("raises no issues: decorative is a choice, not a violation", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        render(() => family.decorative());
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe(`${family.label} — semantic data alternative`, () => {
    it("renders a real HTML table, not an ARIA imitation", () => {
      const { container } = render(() => family.named({ table: { columns: COLUMNS } }));
      const table = container.querySelector("table");
      expect(table).not.toBeNull();
      expect(table?.querySelectorAll('thead th[scope="col"]')).toHaveLength(COLUMNS.length);
      expect(
        Array.from(table?.querySelectorAll("thead th") ?? []).map((th) => th.textContent),
      ).toEqual([...COLUMNS]);
    });

    it("derives rows from the same data the marks are drawn from", () => {
      const { container } = render(() => family.named({ table: { columns: COLUMNS } }));
      expect(tableValues(container)).toEqual(["3", "11", "5"]);
      expect(tableLabels(container)).toHaveLength(3);
    });

    it("relates the table to the graphic with aria-details", () => {
      const { container } = render(() => family.named({ table: { columns: COLUMNS } }));
      const details = svgOf(container).getAttribute("aria-details");
      expect(details).not.toBeNull();
      expect(container.querySelector("table")?.id).toBe(details);
    });

    it("captions the table with the chart name when the caller supplies none", () => {
      const { container } = render(() => family.named({ table: { columns: COLUMNS } }));
      expect(container.querySelector("caption")?.textContent).toBe(NAME);
    });

    it("leaves the table visible by default and hides it only on explicit opt-in", () => {
      const { container: shown } = render(() => family.named({ table: { columns: COLUMNS } }));
      const visible = shown.querySelector("[data-silkplot-alternative]") as HTMLElement;
      expect(visible.style.position).not.toBe("absolute");

      const { container: hidden } = render(() =>
        family.named({ table: { columns: COLUMNS }, tableHidden: true }),
      );
      const clipped = hidden.querySelector("[data-silkplot-alternative]") as HTMLElement;
      // Clipped, not `display: none` — the latter would remove it from the
      // accessibility tree too, defeating the entire purpose.
      expect(clipped.style.position).toBe("absolute");
      expect(clipped.style.display).not.toBe("none");
    });
  });

  describe(`${family.label} — replacement data`, () => {
    it("updates the table from the same data replacement that moves the marks", () => {
      const { node, swap, valuesBefore, valuesAfter, labelsAfter } = family.replaceable();
      const { container } = render(node);

      expect(tableValues(container)).toEqual(valuesBefore);

      swap();

      expect(tableValues(container)).toEqual(valuesAfter);
      expect(tableLabels(container)).toEqual(labelsAfter);
      // Guard against a vacuous pass: identical datasets would satisfy the
      // assertion above against a table that never recomputed.
      expect(valuesAfter).not.toEqual(valuesBefore);
    });
  });
}

describe("multiple charts on one page — ids do not collide", () => {
  it("gives every chart its own ids", () => {
    const { container } = render(() => (
      <>
        {FAMILIES.map((family) => family.named({ desc: DESC, table: { columns: COLUMNS } }))}
      </>
    ));

    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points each chart's relationships at its own nodes, not a neighbour's", () => {
    const { container } = render(() => (
      <>
        <LineChart
          data={TIME_BEFORE}
          width={W}
          height={H}
          title="First chart"
          desc="First description"
          table={{ columns: COLUMNS }}
        />
        <BarChart
          data={BAND_BEFORE}
          width={W}
          height={H}
          title="Second chart"
          desc="Second description"
          table={{ columns: COLUMNS }}
        />
      </>
    ));

    const svgs = Array.from(container.querySelectorAll("svg")) as SVGSVGElement[];
    expect(svgs).toHaveLength(2);
    expect(computedName(svgs[0] as SVGSVGElement)).toBe("First chart");
    expect(computedName(svgs[1] as SVGSVGElement)).toBe("Second chart");
    expect(computedDescription(svgs[0] as SVGSVGElement)).toContain("First description");
    expect(computedDescription(svgs[1] as SVGSVGElement)).toContain("Second description");

    const details = svgs.map((svg) => svg.getAttribute("aria-details"));
    expect(details[0]).not.toBe(details[1]);
  });

  it("keeps two charts of the SAME family apart", () => {
    // The family loop above renders one of each; two of a kind is where a
    // module-level id counter, or an id derived from the component name, would
    // finally collide.
    const { container } = render(() => (
      <>
        <LineChart data={TIME_BEFORE} width={W} height={H} title="Left" desc="Left desc" />
        <LineChart data={TIME_AFTER} width={W} height={H} title="Right" desc="Right desc" />
      </>
    ));

    const svgs = Array.from(container.querySelectorAll("svg")) as SVGSVGElement[];
    expect(computedName(svgs[0] as SVGSVGElement)).toBe("Left");
    expect(computedName(svgs[1] as SVGSVGElement)).toBe("Right");
    expect(svgs[0]?.getAttribute("aria-labelledby")).not.toBe(
      svgs[1]?.getAttribute("aria-labelledby"),
    );
  });
});

describe("naming by reference", () => {
  it("accepts a labelledBy pointing at an existing heading instead of a title", () => {
    const { container } = render(() => (
      <>
        <h2 id="bookings-heading">Bookings this quarter</h2>
        <LineChart
          data={TIME_BEFORE}
          width={W}
          height={H}
          labelledBy="bookings-heading"
          desc={DESC}
        />
      </>
    ));
    const svg = svgOf(container);
    expect(svg.getAttribute("aria-labelledby")).toBe("bookings-heading");
    expect(computedName(svg)).toBe("Bookings this quarter");
    // The library does not duplicate the heading into a <title> it cannot keep
    // in sync with the page.
    expect(svg.querySelector("title")).toBeNull();
  });

  it("accepts a describedBy pointing at application-owned prose", () => {
    const { container } = render(() => (
      <>
        <p id="bookings-note">Figures exclude cancellations.</p>
        <LineChart
          data={TIME_BEFORE}
          width={W}
          height={H}
          title={NAME}
          describedBy="bookings-note"
        />
      </>
    ));
    expect(computedDescription(svgOf(container))).toContain("Figures exclude cancellations.");
  });
});
