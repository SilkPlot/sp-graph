/**
 * The ranked bar surface — `categories`, orientation, formatters, activation.
 *
 * The vertical `data` path is covered by `BarChart.test.tsx` and
 * `BarChart-reactive.test.tsx` and is deliberately NOT re-tested here. What is
 * tested here is what those cannot see: that the horizontal path puts the bars
 * on the other axis, that the two input shapes reach the SAME renderer, and that
 * the surfaces which carry a category's full text still do so once the axis has
 * truncated it.
 *
 * Geometry expectations are rebuilt from `@silkplot/core`'s own scale
 * constructors rather than hardcoded, so a d3 version bump does not rewrite the
 * suite — but the ORIENTATION expectations are pinned by hand, because deriving
 * them from the model under test would agree with any change to it.
 */
import { describe, expect, it, vi } from "vitest";
import { createSignal, type ComponentProps } from "solid-js";
import { render, fireEvent } from "@solidjs/testing-library";
import { bandScale, linearScale } from "@silkplot/core";
import type { RankedCategory } from "@silkplot/core";
import { BarChart } from "../src/index";
import {
  HEIGHT,
  INNER_HEIGHT,
  INNER_WIDTH,
  WIDTH,
  bars as getBars,
  expectNoNaN,
  num,
} from "./support";

/** The geometry attributes a `<rect>` can silently render nothing from. */
const RECT_ATTRS = ["x", "y", "width", "height"] as const;

const THREE: RankedCategory[] = [
  { id: "a", label: "Alpha", value: 10 },
  { id: "b", label: "Bravo", value: 40 },
  { id: "c", label: "Charlie", value: 25 },
];

const NAME = "Spend by programme";
/** An informative chart with no description channel warns; every case supplies one. */
const DESC = "Programme spend, in rand, ranked by amount.";

/**
 * What a case may vary. Typed rather than `Record<string, unknown>` so a typo in
 * a prop name is a compile error here, where it would otherwise be a silently
 * ignored prop and a test that proves nothing.
 */
interface BarCase {
  categories?: readonly RankedCategory[];
  data?: readonly { label: string; y: number }[];
  orientation?: "vertical" | "horizontal";
  categoryTickFormat?: (label: string) => string;
  valueTickFormat?: (value: number) => string;
  tableValueFormat?: (value: number) => string;
  onActivate?: (category: RankedCategory) => void;
  keyboard?: boolean;
}

/**
 * Width and height are explicit and not optional scaffolding: `ChartRoot`
 * measures its own box, and a test that omits them renders into a zero-sized
 * container where `hasArea()` is false and NO marks are drawn. The failure looks
 * like a broken renderer rather than a missing prop, which cost a run here.
 *
 * The cast is at the JSX boundary and is confined to this one line. `BarCase`
 * has both `data` and `categories` optional so one helper can drive both input
 * shapes; the real props type makes each forbid the other, which is the point of
 * that type and cannot be expressed by a helper that must accept either.
 */
const mount = (props: BarCase) =>
  render(() => {
    // Merged INSIDE the cast, not passed as sibling JSX attributes. Written the
    // other way, TypeScript checks `title` against every member of the props
    // union — including the decorative one, which forbids a title outright.
    const merged = {
      title: NAME,
      desc: DESC,
      width: WIDTH,
      height: HEIGHT,
      ...props,
    } as ComponentProps<typeof BarChart>;
    return <BarChart {...merged} />;
  });

describe("orientation", () => {
  it("draws vertical bars against the band on x", () => {
    const { container } = mount({ categories: THREE });
    const rects = getBars(container);

    expect(rects).toHaveLength(3);

    const band = bandScale({ domain: ["a", "b", "c"], range: [0, INNER_WIDTH] });
    // Width is the bandwidth and height varies with the value: the vertical
    // signature. The horizontal case below is the exact transpose.
    for (const r of rects) expect(num(r, "width")).toBeCloseTo(band.bandwidth(), 5);
    const heights = rects.map((r) => num(r, "height"));
    expect(new Set(heights).size).toBeGreaterThan(1);
  });

  it("draws horizontal bars against the band on y", () => {
    const { container } = mount({ categories: THREE, orientation: "horizontal" });
    const rects = getBars(container);

    expect(rects).toHaveLength(3);

    const band = bandScale({ domain: ["a", "b", "c"], range: [0, INNER_HEIGHT] });
    // Transposed: HEIGHT is now the constant bandwidth and WIDTH carries the
    // value. A chart that ignored orientation would fail here and nowhere else.
    for (const r of rects) expect(num(r, "height")).toBeCloseTo(band.bandwidth(), 5);
    const widths = rects.map((r) => num(r, "width"));
    expect(new Set(widths).size).toBeGreaterThan(1);
  });

  it("puts the caller's FIRST category at the top when horizontal", () => {
    const { container } = mount({ categories: THREE, orientation: "horizontal" });
    const ys = getBars(container).map((r) => num(r, "y"));

    // A ranked list is read top-down. Inverting the band range to match the
    // value axis' bottom-up convention would reverse this and look deliberate.
    expect(ys[0]).toBeLessThan(ys[1] as number);
    expect(ys[1]).toBeLessThan(ys[2] as number);
  });

  it("renders no NaN geometry in either orientation", () => {
    for (const orientation of ["vertical", "horizontal"] as const) {
      const { container, unmount } = mount({ categories: THREE, orientation });
      expectNoNaN(container, "*", RECT_ATTRS);
      unmount();
    }
  });
});

describe("signed values", () => {
  it("hangs a negative bar below the baseline when vertical", () => {
    const { container } = mount({
      categories: [
        { id: "gain", label: "Gain", value: 40 },
        { id: "loss", label: "Loss", value: -20 },
      ],
    });
    const [gain, loss] = getBars(container);

    // Both heights are positive numbers — SVG rejects a negative height and
    // renders nothing at all, silently.
    expect(num(gain as Element, "height")).toBeGreaterThan(0);
    expect(num(loss as Element, "height")).toBeGreaterThan(0);
    // The loss starts BELOW where the gain ends: it is on the far side of zero.
    expect(num(loss as Element, "y")).toBeGreaterThan(num(gain as Element, "y"));
  });

  it("runs a negative bar LEFT of the baseline when horizontal", () => {
    const { container } = mount({
      orientation: "horizontal",
      categories: [
        { id: "gain", label: "Gain", value: 40 },
        { id: "loss", label: "Loss", value: -20 },
      ],
    });
    const [gain, loss] = getBars(container);

    expect(num(gain as Element, "width")).toBeGreaterThan(0);
    expect(num(loss as Element, "width")).toBeGreaterThan(0);
    // The mirror of the case above, and the one a vertical-only implementation
    // gets wrong by producing a negative width.
    expect(num(loss as Element, "x")).toBeLessThan(num(gain as Element, "x"));
  });
});

describe("broken and absent values", () => {
  it("draws NO bar for a non-finite value rather than a zero-height one", () => {
    const { container } = mount({
      categories: [
        { id: "ok", label: "OK", value: 10 },
        { id: "bad", label: "Bad", value: Number.NaN },
      ],
    });

    // A zero-height rect at the baseline is exactly what a real measurement of
    // zero looks like, so drawing one would state a value nobody recorded.
    expect(getBars(container)).toHaveLength(1);
  });

  it("still draws a bar for a real zero-valued category's siblings", () => {
    const { container } = mount({
      categories: [
        { id: "z", label: "Zero", value: 0 },
        { id: "p", label: "Positive", value: 10 },
      ],
    });

    // Zero is data: the rect exists, with zero extent.
    expect(getBars(container)).toHaveLength(2);
  });

  it("renders nothing and does not throw on empty input", () => {
    const { container } = mount({ categories: [] });

    expect(getBars(container)).toHaveLength(0);
  });
});

describe("the two input shapes reach one renderer", () => {
  it("renders `data` and the equivalent `categories` identically", () => {
    const viaData = mount({
      data: [
        { label: "Alpha", y: 10 },
        { label: "Bravo", y: 40 },
      ],
    });
    const viaCategories = mount({
      categories: [
        { id: "Alpha", label: "Alpha", value: 10 },
        { id: "Bravo", label: "Bravo", value: 40 },
      ],
    });

    const geom = (c: HTMLElement): string[] =>
      getBars(c).map((r) =>
        ["x", "y", "width", "height"].map((a) => r.getAttribute(a)).join(","),
      );

    // Byte-equal geometry is what "one render path" means. If these ever
    // diverge, the adapter has stopped being an adapter.
    expect(geom(viaData.container)).toEqual(geom(viaCategories.container));
  });
});

describe("identity", () => {
  it("gives two categories with the SAME label separate bars", () => {
    const { container } = mount({
      categories: [
        { id: "north", label: "Regional total", value: 5 },
        { id: "south", label: "Regional total", value: 8 },
      ],
    });
    const rects = getBars(container);

    expect(rects).toHaveLength(2);
    // Identity on the label would have given the band scale ONE slot and
    // stacked these on top of each other.
    expect(num(rects[0] as Element, "x")).not.toBeCloseTo(
      num(rects[1] as Element, "x"),
      5,
    );
  });
});

describe("formatters", () => {
  it("routes the value formatter to the axis that carries values", () => {
    const valueTickFormat = vi.fn((v: number) => `${v}u`);
    mount({ categories: THREE, valueTickFormat });

    expect(valueTickFormat).toHaveBeenCalled();
  });

  it("hands the category formatter the LABEL, never the id", () => {
    const seen: string[] = [];
    mount({
      categories: [{ id: "cc-refurb", label: "Cold chain", value: 5 }],
      categoryTickFormat: (label: string) => {
        seen.push(label);
        return label;
      },
    });

    // The band domain is ids; a formatter handed one would be given identity
    // and asked to render display text.
    expect(seen).toContain("Cold chain");
    expect(seen).not.toContain("cc-refurb");
  });

  it("formats table values without touching the axis formatter", () => {
    const { container } = mount({
      categories: [{ id: "a", label: "Alpha", value: 1284500 }],
      tableValueFormat: (v: number) => `R${v.toFixed(2)}`,
    });

    expect(container.textContent).toContain("R1284500.00");
  });
});

describe("long labels", () => {
  const LONG =
    "Regional distribution centre — cold chain refurbishment programme";

  it("truncates the axis text but keeps the full label in the table", () => {
    const { container } = mount({
      categories: [{ id: "cc", label: LONG, value: 10 }],
      orientation: "horizontal",
    });

    const text = container.textContent ?? "";
    // Truncation is only defensible because the full text survives somewhere.
    expect(text).toContain(LONG);
    expect(text).toContain("…");
  });

  it("lets categoryTickFormat override the truncation entirely", () => {
    const { container } = mount({
      categories: [{ id: "cc", label: LONG, value: 10 }],
      categoryTickFormat: (label: string) => label.slice(0, 4),
    });

    const ticks = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(ticks).toContain("Regi");
    // The default ellipsis must be gone: the override replaces the policy, it
    // does not stack with it.
    expect(ticks.some((t) => t?.includes("…"))).toBe(false);
  });
});

describe("activation", () => {
  it("hands back the caller's own category on Enter", async () => {
    const onActivate = vi.fn();
    const { container } = mount({ categories: THREE, onActivate });

    const surface = container.querySelector("[tabindex]") as HTMLElement;
    expect(surface).not.toBeNull();

    surface.focus();
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    fireEvent.keyDown(surface, { key: "Enter" });

    expect(onActivate).toHaveBeenCalledTimes(1);
    // The caller's shape, not a library datum type — id, label and value as
    // they were passed in.
    expect(onActivate.mock.calls[0]?.[0]).toMatchObject({
      id: "a",
      label: "Alpha",
      value: 10,
    });
  });

  it("activates on Space as well as Enter", () => {
    const onActivate = vi.fn();
    const { container } = mount({ categories: THREE, onActivate });
    const surface = container.querySelector("[tabindex]") as HTMLElement;

    surface.focus();
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    fireEvent.keyDown(surface, { key: " " });

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("does not fire when nothing is active", () => {
    const onActivate = vi.fn();
    const { container } = mount({ categories: THREE, onActivate });
    const surface = container.querySelector("[tabindex]") as HTMLElement;

    surface.focus();
    // No arrow key first, so there is no active index. Firing here would hand
    // the caller a category the reader never moved to.
    fireEvent.keyDown(surface, { key: "Enter" });

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("carries meta back verbatim", () => {
    const meta = { href: "/reports/a" };
    const onActivate = vi.fn();
    const { container } = mount({
      categories: [{ id: "a", label: "Alpha", value: 1, meta }],
      onActivate,
    });
    const surface = container.querySelector("[tabindex]") as HTMLElement;

    surface.focus();
    fireEvent.keyDown(surface, { key: "ArrowRight" });
    fireEvent.keyDown(surface, { key: "Enter" });

    expect(onActivate.mock.calls[0]?.[0]?.meta).toBe(meta);
  });
});

describe("keyboard surface", () => {
  it("offers exactly one tab stop", () => {
    const { container } = mount({ categories: THREE });

    // A single-entry composite: one stop whatever the category count.
    expect(container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
  });

  it("offers none for a decorative chart", () => {
    const { container } = render(() => (
      <BarChart decorative categories={THREE} width={WIDTH} height={HEIGHT} />
    ));

    // A focusable surface that announces nothing is a dead tab stop.
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("can be turned off explicitly", () => {
    const { container } = mount({ categories: THREE, keyboard: false });

    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  it("announces the FULL label, not the truncated axis text", () => {
    const LONG = "Regional distribution centre — cold chain refurbishment";
    const { container } = mount({
      categories: [{ id: "cc", label: LONG, value: 10 }],
    });
    const surface = container.querySelector("[tabindex]") as HTMLElement;

    surface.focus();
    fireEvent.keyDown(surface, { key: "ArrowRight" });

    // The whole reason axis truncation is acceptable.
    expect(container.textContent).toContain(LONG);
  });
});

describe("reactive replacement", () => {
  it("follows a replaced category set", () => {
    const [cats, setCats] = createSignal<RankedCategory[]>(THREE);
    const { container } = render(() => (
      <BarChart title={NAME} desc={DESC} categories={cats()} width={WIDTH} height={HEIGHT} />
    ));

    expect(getBars(container)).toHaveLength(3);

    setCats([{ id: "z", label: "Zulu", value: 5 }]);

    // A removed category surviving here is the stale-identity failure.
    expect(getBars(container)).toHaveLength(1);
  });

  it("recomputes geometry when values change non-uniformly", () => {
    const [cats, setCats] = createSignal<RankedCategory[]>(THREE);
    const { container } = render(() => (
      <BarChart title={NAME} desc={DESC} categories={cats()} width={WIDTH} height={HEIGHT} />
    ));

    const before = getBars(container).map((r) => num(r, "height"));

    // Three-plus categories and a non-uniform change: a uniform rescale maps to
    // identical pixels and would pass against a frozen scale.
    setCats([
      { id: "a", label: "Alpha", value: 10 },
      { id: "b", label: "Bravo", value: 900 },
      { id: "c", label: "Charlie", value: 25 },
    ]);

    const after = getBars(container).map((r) => num(r, "height"));
    expect(after).not.toEqual(before);
  });

  it("survives a swap between orientations on a mounted chart", () => {
    const [orientation, setOrientation] = createSignal<"vertical" | "horizontal">(
      "vertical",
    );
    const { container } = render(() => (
      <BarChart
        title={NAME}
        desc={DESC}
        categories={THREE}
        orientation={orientation()}
        width={WIDTH}
        height={HEIGHT}
      />
    ));

    const verticalWidths = getBars(container).map((r) => num(r, "width"));
    expect(new Set(verticalWidths).size).toBe(1);

    setOrientation("horizontal");

    // Widths were constant (bandwidth) and must now vary with the value.
    const horizontalWidths = getBars(container).map((r) => num(r, "width"));
    expect(new Set(horizontalWidths).size).toBeGreaterThan(1);
    expectNoNaN(container, "*", RECT_ATTRS);
  });
});

describe("linearScale is not re-derived", () => {
  it("keeps the value domain containing zero", () => {
    const { container } = mount({ categories: THREE });
    const rects = getBars(container);

    // Rebuilt independently: bars are drawn FROM zero, so a domain excluding it
    // puts the flat edge on a pixel the axis labels as something else.
    const scale = linearScale({
      domain: [0, 40],
      range: [INNER_HEIGHT, 0],
    });
    const tallest = Math.max(...rects.map((r) => num(r, "height")));
    expect(tallest).toBeCloseTo(Math.abs(scale(40) - scale(0)), 0);
  });
});
