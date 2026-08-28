/**
 * Heatmap layout — bins and rectangles as data.
 *
 * Geometry is asserted as values, the same way `layoutBarRects` asserts bars:
 * a node test walks the compute, never a rendered tree.
 */
import { describe, expect, it } from "vitest";
import {
  binHeatmap,
  createHeatmapIndex,
  firstSeenKeys,
  heatmapBands,
  heatmapHatch,
  heatmapHatchLines,
  heatmapT,
  layoutHeatmapCells,
  locateHeatmapCell,
  numericBinIndex,
  numericBinKey,
} from "../src/index";
import type { HeatmapObservation } from "../src/index";

function byCell(
  bins: readonly { column: string; row: string; value: number }[],
  column: string,
  row: string,
) {
  return bins.find((bin) => bin.column === column && bin.row === row);
}

describe("firstSeenKeys", () => {
  it("keeps first-seen order and drops duplicates", () => {
    expect(firstSeenKeys(["b", "a", "b", 1, "1"])).toEqual(["b", "a", "1"]);
  });

  it("returns empty when nothing arrives", () => {
    expect(firstSeenKeys([])).toEqual([]);
  });
});

describe("numericBinIndex", () => {
  it("puts the closed top edge in the last bin", () => {
    expect(numericBinIndex(0, 0, 10, 5)).toBe(0);
    expect(numericBinIndex(2, 0, 10, 5)).toBe(1);
    expect(numericBinIndex(10, 0, 10, 5)).toBe(4);
  });

  it("rejects a non-finite value or an empty bin count", () => {
    expect(numericBinIndex(Number.NaN, 0, 10, 5)).toBe(-1);
    expect(numericBinIndex(3, 0, 10, 0)).toBe(-1);
    expect(numericBinIndex(-1, 0, 10, 5)).toBe(-1);
    expect(numericBinIndex(11, 0, 10, 5)).toBe(-1);
  });

  it("collapses a zero-width domain to bin 0", () => {
    expect(numericBinIndex(4, 4, 4, 8)).toBe(0);
  });
});

describe("numericBinKey", () => {
  it("is the index as a string", () => {
    expect(numericBinKey(0)).toBe("0");
    expect(numericBinKey(3)).toBe("3");
  });
});

describe("heatmapT and heatmapHatch", () => {
  it("maps the domain ends to 0 and 1", () => {
    expect(heatmapT(0, [0, 10])).toBe(0);
    expect(heatmapT(10, [0, 10])).toBe(1);
    expect(heatmapT(5, [0, 10])).toBe(0.5);
  });

  it("treats a collapsed non-zero domain as fully on", () => {
    expect(heatmapT(4, [4, 4])).toBe(1);
    expect(heatmapT(0, [0, 0])).toBe(0);
    expect(heatmapT(Number.NaN, [0, 10])).toBe(0);
  });

  it("leaves a zero value unhatched and densifies with t", () => {
    expect(heatmapHatch(0)).toBe(0);
    expect(heatmapHatch(-1)).toBe(0);
    expect(heatmapHatch(1)).toBe(4);
    expect(heatmapHatch(0.5)).toBeGreaterThan(0);
    expect(heatmapHatch(1)).toBeGreaterThan(heatmapHatch(0.25));
  });
});

describe("binHeatmap", () => {
  it("aggregates duplicate cells and fills the complete grid with zeros", () => {
    const grid = binHeatmap({
      observations: [
        { x: "a", y: "n", value: 2 },
        { x: "a", y: "n", value: 3 },
        { x: "b", y: "s" },
      ],
    });
    expect(grid.columns).toEqual(["a", "b"]);
    expect(grid.rows).toEqual(["n", "s"]);
    expect(grid.bins).toHaveLength(4);
    expect(byCell(grid.bins, "a", "n")?.value).toBe(5);
    expect(byCell(grid.bins, "b", "s")?.value).toBe(1);
    expect(byCell(grid.bins, "a", "s")?.value).toBe(0);
    expect(byCell(grid.bins, "b", "n")?.value).toBe(0);
  });

  it("honours an explicit domain so a missing category still occupies a cell", () => {
    const grid = binHeatmap({
      observations: [{ x: "a", y: "n", value: 4 }],
      columns: ["a", "b"],
      rows: ["n", "s"],
    });
    expect(grid.bins).toHaveLength(4);
    expect(byCell(grid.bins, "b", "s")?.value).toBe(0);
  });

  it("skips a non-finite value rather than counting it as zero", () => {
    const grid = binHeatmap({
      observations: [
        { x: "a", y: "n", value: Number.NaN },
        { x: "a", y: "n", value: 7 },
      ],
    });
    expect(byCell(grid.bins, "a", "n")?.value).toBe(7);
  });

  it("bins numeric x and y onto equal-width intervals", () => {
    const observations: HeatmapObservation[] = [
      { x: 0, y: 0, value: 1 },
      { x: 9, y: 9, value: 8 },
      { x: 1, y: 1, value: 1 },
    ];
    const grid = binHeatmap({ observations, xBins: 2, yBins: 2 });
    expect(grid.columns).toEqual(["0", "1"]);
    expect(grid.rows).toEqual(["0", "1"]);
    expect(byCell(grid.bins, "0", "0")?.value).toBe(2);
    expect(byCell(grid.bins, "1", "1")?.value).toBe(8);
    expect(byCell(grid.bins, "0", "1")?.value).toBe(0);
  });

  it("does not treat a categorical '1' as a numeric bin", () => {
    const grid = binHeatmap({
      observations: [
        { x: "1", y: "n", value: 2 },
        { x: "2", y: "n", value: 5 },
      ],
    });
    expect(grid.columns).toEqual(["1", "2"]);
    expect(byCell(grid.bins, "1", "n")?.value).toBe(2);
  });

  it("returns an empty grid when nothing finite survives", () => {
    const grid = binHeatmap({
      observations: [{ x: 1, y: 1, value: Number.NaN }],
      xBins: 3,
      yBins: 3,
    });
    expect(grid.columns).toEqual(["0", "1", "2"]);
    expect(grid.rows).toEqual(["0", "1", "2"]);
    expect(grid.bins.every((bin) => bin.value === 0)).toBe(true);
  });
});

describe("layoutHeatmapCells", () => {
  it("places cells on the same bands the axes will read", () => {
    const grid = binHeatmap({
      observations: [
        { x: "a", y: "n", value: 0 },
        { x: "b", y: "s", value: 10 },
      ],
      columns: ["a", "b"],
      rows: ["n", "s"],
    });
    const options = { columns: grid.columns, rows: grid.rows, width: 200, height: 100, padding: 0 };
    const bands = heatmapBands(options);
    const cells = layoutHeatmapCells(grid.bins, options);
    expect(cells).toHaveLength(4);
    const hot = cells.find((cell) => cell.column === "b" && cell.row === "s");
    expect(hot?.x).toBe(bands.columns("b"));
    expect(hot?.y).toBe(bands.rows("s"));
    expect(hot?.width).toBe(bands.columns.bandwidth());
    expect(hot?.height).toBe(bands.rows.bandwidth());
    expect(hot?.t).toBe(1);
    expect(hot?.hatch).toBe(4);
    const cold = cells.find((cell) => cell.column === "a" && cell.row === "n");
    expect(cold?.t).toBe(0);
    expect(cold?.hatch).toBe(0);
  });

  it("skips a bin whose category is not on the band", () => {
    const cells = layoutHeatmapCells([{ column: "z", row: "n", value: 1 }], {
      columns: ["a"],
      rows: ["n"],
      width: 100,
      height: 50,
      padding: 0,
    });
    expect(cells).toEqual([]);
  });

  it("skips a cell whose bandwidth is not finite", () => {
    const cells = layoutHeatmapCells([{ column: "a", row: "n", value: 1 }], {
      columns: ["a"],
      rows: ["n"],
      width: Number.NaN,
      height: 50,
      padding: 0,
    });
    expect(cells).toEqual([]);
  });
});

describe("heatmapHatchLines", () => {
  const box = { x: 0, y: 0, width: 20, height: 20, hatch: 0 };

  it("emits nothing for hatch 0", () => {
    expect(heatmapHatchLines(box)).toEqual([]);
  });

  it("densifies with hatch level and stays inside the cell", () => {
    const sparse = heatmapHatchLines({ ...box, hatch: 1 });
    const dense = heatmapHatchLines({ ...box, hatch: 4 });
    expect(sparse.length).toBeGreaterThan(0);
    expect(dense.length).toBeGreaterThan(sparse.length);
    for (const line of dense) {
      expect(line.x1).toBeGreaterThanOrEqual(0);
      expect(line.x2).toBeLessThanOrEqual(20);
      expect(line.y1).toBeGreaterThanOrEqual(0);
      expect(line.y2).toBeLessThanOrEqual(20);
    }
  });

  it("emits nothing for a collapsed cell", () => {
    expect(heatmapHatchLines({ x: 0, y: 0, width: 0, height: 10, hatch: 4 })).toEqual([]);
  });

  it("emits nothing for an unknown hatch level", () => {
    expect(heatmapHatchLines({ ...box, hatch: 9 })).toEqual([]);
  });
});

describe("locateHeatmapCell and createHeatmapIndex", () => {
  const cells = layoutHeatmapCells(
    [
      { column: "a", row: "n", value: 1 },
      { column: "b", row: "n", value: 2 },
    ],
    { columns: ["a", "b"], rows: ["n"], width: 100, height: 20, padding: 0 },
  );

  it("hits the cell containing the point and misses the gap", () => {
    const left = cells[0]!;
    expect(locateHeatmapCell(cells, left.x + 1, left.y + 1)).toBe(0);
    expect(locateHeatmapCell(cells, -1, 0)).toBe(-1);
  });

  it("lets pointer and keyboard resolve the same record", () => {
    const index = createHeatmapIndex(cells, "heat");
    expect(index.length).toBe(2);
    expect(index.at(-1)).toBeUndefined();
    expect(index.at(2)).toBeUndefined();
    const left = cells[0]!;
    const ordinal = index.locate(left.x + 1, left.y + 1);
    expect(ordinal).toBe(0);
    const record = index.at(ordinal);
    expect(record?.seriesId).toBe("heat");
    expect(record?.datum).toEqual({ column: "a", row: "n", value: 1 });
    expect(record?.at).toEqual({ kind: "category", category: "a × n" });
    expect(record?.position.x).toBe(left.x + left.width / 2);
  });

  it("defaults the series id when the caller does not name one", () => {
    expect(createHeatmapIndex(cells).at(0)?.seriesId).toBe("heatmap");
  });
});

describe("binHeatmap numeric and domain edges", () => {
  it("drops a non-numeric x when xBins is set", () => {
    const grid = binHeatmap({
      observations: [
        { x: "a", y: 1, value: 4 },
        { x: 0, y: 1, value: 3 },
      ],
      xBins: 2,
      yBins: 2,
    });
    expect(grid.bins.reduce((sum, bin) => sum + bin.value, 0)).toBe(3);
  });

  it("drops a non-numeric y when yBins is set", () => {
    const grid = binHeatmap({
      observations: [
        { x: 1, y: "n", value: 4 },
        { x: 1, y: 0, value: 2 },
      ],
      xBins: 2,
      yBins: 2,
    });
    expect(grid.bins.reduce((sum, bin) => sum + bin.value, 0)).toBe(2);
  });

  it("drops a non-finite numeric coordinate", () => {
    const grid = binHeatmap({
      observations: [
        { x: Number.NaN, y: 0, value: 4 },
        { x: 1, y: Number.POSITIVE_INFINITY, value: 4 },
        { x: 0, y: 0, value: 5 },
      ],
      xBins: 2,
      yBins: 2,
    });
    expect(grid.bins.reduce((sum, bin) => sum + bin.value, 0)).toBe(5);
  });

  it("ignores an observation whose category is not on the explicit domain", () => {
    const grid = binHeatmap({
      observations: [
        { x: "a", y: "n", value: 3 },
        { x: "z", y: "n", value: 9 },
      ],
      columns: ["a"],
      rows: ["n"],
    });
    expect(grid.bins).toHaveLength(1);
    expect(grid.bins[0]!.value).toBe(3);
  });
});

describe("heatmapBands default padding", () => {
  it("pads more than a zero-padding band", () => {
    const padded = heatmapBands({ columns: ["a", "b"], rows: ["n"], width: 100, height: 50 });
    const tight = heatmapBands({
      columns: ["a", "b"],
      rows: ["n"],
      width: 100,
      height: 50,
      padding: 0,
    });
    expect(padded.columns.bandwidth()).toBeLessThan(tight.columns.bandwidth());
  });
});
