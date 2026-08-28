/**
 * Heatmap layout — bin observations onto a grid, then map bins to pixels.
 *
 * There is no DOM here. Charts paint the cells; they do not re-derive the
 * bins or the hatch geometry. Colour is a render concern. The non-colour
 * channel is hatch density, computed from the same normalised value the
 * renderer uses for fill so the two cannot disagree.
 */
import { bandScale, type ScaleBand } from "./scales";
import { extentOf } from "./extent";
import type { ActivePoint, ActivePointIndex } from "./active-point";

/** One observation to bin. Absent `value` counts as 1. */
export interface HeatmapObservation {
  x: string | number;
  y: string | number;
  value?: number;
}

/** Aggregated value at one grid coordinate, in data space. */
export interface HeatmapBin {
  column: string;
  row: string;
  value: number;
}

export interface BinHeatmapInput {
  observations: readonly HeatmapObservation[];
  /** Explicit column domain. Absent → first-seen keys, or numeric bins. */
  columns?: readonly string[];
  /** Explicit row domain. Absent → first-seen keys, or numeric bins. */
  rows?: readonly string[];
  /** When set, numeric `x` is binned into this many equal-width intervals. */
  xBins?: number;
  /** When set, numeric `y` is binned into this many equal-width intervals. */
  yBins?: number;
}

export interface HeatmapGrid {
  columns: readonly string[];
  rows: readonly string[];
  bins: readonly HeatmapBin[];
}

export interface LayoutHeatmapOptions {
  columns: readonly string[];
  rows: readonly string[];
  width: number;
  height: number;
  /** Band padding as a fraction of the step. Default 0.05. */
  padding?: number;
}

/** One painted cell, in inner-plot pixels, with both encoding channels. */
export interface HeatmapCell extends HeatmapBin {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Normalised value in `[0, 1]` against the layout's value extent. */
  t: number;
  /** Hatch density 0 (none) … 4 (densest). Colour is never the only channel. */
  hatch: number;
}

export interface HatchSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HeatmapBands {
  columns: ScaleBand<string>;
  rows: ScaleBand<string>;
}

/** Inclusive hatch levels: 0 empty, 4 densest. */
export const HEATMAP_HATCH_LEVELS = 5;

const HATCH_SPACING = [0, 14, 9, 6, 4] as const;
const DEFAULT_PADDING = 0.05;

/** First-seen string keys, not sorted. */
export function firstSeenKeys(values: readonly (string | number)[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * Equal-width bin index in `[0, bins)`, or `-1` when the value is unusable.
 *
 * A value exactly at the top edge lands in the last bin so the closed
 * interval at `hi` is not dropped.
 */
export function numericBinIndex(value: number, lo: number, hi: number, bins: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(lo) || !Number.isFinite(hi) || bins < 1) {
    return -1;
  }
  if (hi <= lo) return 0;
  const t = (value - lo) / (hi - lo);
  if (t < 0 || t > 1) return -1;
  return Math.min(bins - 1, Math.floor(t * bins));
}

export function numericBinKey(index: number): string {
  return String(index);
}

/** Normalised value in `[0, 1]`. A collapsed domain with a present value is 1. */
export function heatmapT(value: number, domain: readonly [number, number]): number {
  if (!Number.isFinite(value)) return 0;
  const [lo, hi] = domain;
  if (hi <= lo) return value === 0 ? 0 : 1;
  const t = (value - lo) / (hi - lo);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/** Hatch density from a normalised value. Zero stays unhatched. */
export function heatmapHatch(t: number): number {
  if (!(t > 0)) return 0;
  return Math.max(1, Math.round(t * (HEATMAP_HATCH_LEVELS - 1)));
}

export function heatmapBands(options: LayoutHeatmapOptions): HeatmapBands {
  const padding = options.padding ?? DEFAULT_PADDING;
  return {
    columns: bandScale({
      domain: options.columns,
      range: [0, options.width],
      padding,
    }),
    rows: bandScale({
      domain: options.rows,
      range: [0, options.height],
      padding,
    }),
  };
}

/**
 * Bin observations onto a complete column × row grid.
 *
 * Missing combinations are zero, not omitted — a heatmap that dropped empty
 * cells would change shape when a replacement series thinned out.
 */
export function binHeatmap(input: BinHeatmapInput): HeatmapGrid {
  const xNumeric = input.xBins !== undefined && input.columns === undefined;
  const yNumeric = input.yBins !== undefined && input.rows === undefined;
  const prepared = prepareObservations(input.observations, xNumeric, yNumeric);
  const columns = resolveAxis(input.columns, prepared.xs, xNumeric, input.xBins);
  const rows = resolveAxis(input.rows, prepared.ys, yNumeric, input.yBins);
  const totals = aggregate(prepared.points, columns, rows, {
    xBins: xNumeric ? input.xBins : undefined,
    yBins: yNumeric ? input.yBins : undefined,
  });
  return { columns, rows, bins: fillGrid(columns, rows, totals) };
}

export function layoutHeatmapCells(
  bins: readonly HeatmapBin[],
  options: LayoutHeatmapOptions,
): readonly HeatmapCell[] {
  const bands = heatmapBands(options);
  const domain = extentOf(bins, (bin) => bin.value);
  const colWidth = bands.columns.bandwidth();
  const rowHeight = bands.rows.bandwidth();
  const cells: HeatmapCell[] = [];
  for (const bin of bins) {
    const x = bands.columns(bin.column);
    const y = bands.rows(bin.row);
    if (x === undefined || y === undefined) continue;
    if (!Number.isFinite(colWidth) || !Number.isFinite(rowHeight)) continue;
    const t = heatmapT(bin.value, domain);
    cells.push({
      column: bin.column,
      row: bin.row,
      value: bin.value,
      x,
      y,
      width: colWidth,
      height: rowHeight,
      t,
      hatch: heatmapHatch(t),
    });
  }
  return cells;
}

/**
 * Diagonal hatch segments clipped to the cell. Density follows `hatch`;
 * level 0 is no geometry.
 */
export function heatmapHatchLines(
  cell: Pick<HeatmapCell, "x" | "y" | "width" | "height" | "hatch">,
): readonly HatchSegment[] {
  const spacing = HATCH_SPACING[cell.hatch] ?? 0;
  if (spacing <= 0 || cell.width <= 0 || cell.height <= 0) return [];
  const lines: HatchSegment[] = [];
  const start = cell.x - cell.height;
  const end = cell.x + cell.width;
  for (let origin = start; origin < end; origin += spacing) {
    const segment = clipDiagonal(origin, cell);
    if (segment !== undefined) lines.push(segment);
  }
  return lines;
}

/** Point-in-rect locate over already-laid-out cells. */
export function locateHeatmapCell(cells: readonly HeatmapCell[], px: number, py: number): number {
  for (const [i, cell] of cells.entries()) {
    if (px >= cell.x && px < cell.x + cell.width && py >= cell.y && py < cell.y + cell.height) {
      return i;
    }
  }
  return -1;
}

/**
 * Active-point index over laid-out cells. Pointer and keyboard share the
 * same ordinal, the same way the other families do.
 */
export function createHeatmapIndex(
  cells: readonly HeatmapCell[],
  seriesId = "heatmap",
): ActivePointIndex<HeatmapBin> {
  const at = (ordinal: number): ActivePoint<HeatmapBin> | undefined => {
    if (ordinal < 0 || ordinal >= cells.length) return undefined;
    const cell = cells[ordinal] as HeatmapCell;
    return {
      seriesId,
      sourceIndex: ordinal,
      datum: { column: cell.column, row: cell.row, value: cell.value },
      position: { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 },
      at: { kind: "category", category: `${cell.column} × ${cell.row}` },
    };
  };
  return {
    length: cells.length,
    at,
    locate: (px, py) => locateHeatmapCell(cells, px, py),
  };
}

interface Prepared {
  xs: number[] | string[];
  ys: number[] | string[];
  points: readonly { x: string | number; y: string | number; value: number }[];
}

function prepareObservations(
  observations: readonly HeatmapObservation[],
  xNumeric: boolean,
  yNumeric: boolean,
): Prepared {
  const xs: (string | number)[] = [];
  const ys: (string | number)[] = [];
  const points: { x: string | number; y: string | number; value: number }[] = [];
  for (const observation of observations) {
    const value = observation.value === undefined ? 1 : observation.value;
    if (!Number.isFinite(value)) continue;
    if (xNumeric && typeof observation.x !== "number") continue;
    if (yNumeric && typeof observation.y !== "number") continue;
    if (xNumeric && !Number.isFinite(observation.x as number)) continue;
    if (yNumeric && !Number.isFinite(observation.y as number)) continue;
    xs.push(observation.x);
    ys.push(observation.y);
    points.push({ x: observation.x, y: observation.y, value });
  }
  return { xs: xs as number[] | string[], ys: ys as number[] | string[], points };
}

function resolveAxis(
  explicit: readonly string[] | undefined,
  values: readonly (string | number)[],
  numeric: boolean,
  bins: number | undefined,
): readonly string[] {
  if (explicit !== undefined) return explicit;
  if (numeric && bins !== undefined) {
    const count = Math.max(1, bins);
    return Array.from({ length: count }, (_, i) => numericBinKey(i));
  }
  return firstSeenKeys(values);
}

function axisKey(
  value: string | number,
  keys: readonly string[],
  numeric: boolean,
  values: readonly number[],
  bins: number | undefined,
): string | undefined {
  if (!numeric || bins === undefined || typeof value !== "number") {
    const key = String(value);
    return keys.includes(key) ? key : undefined;
  }
  const domain = extentOf(values, (item) => item);
  const index = numericBinIndex(value, domain[0], domain[1], bins);
  if (index < 0) return undefined;
  return numericBinKey(index);
}

function aggregate(
  points: readonly { x: string | number; y: string | number; value: number }[],
  columns: readonly string[],
  rows: readonly string[],
  bins: { xBins?: number; yBins?: number },
): Map<string, number> {
  const xs = points.map((p) => p.x).filter((v): v is number => typeof v === "number");
  const ys = points.map((p) => p.y).filter((v): v is number => typeof v === "number");
  const totals = new Map<string, number>();
  for (const point of points) {
    const column = axisKey(point.x, columns, bins.xBins !== undefined, xs, bins.xBins);
    const row = axisKey(point.y, rows, bins.yBins !== undefined, ys, bins.yBins);
    if (column === undefined || row === undefined) continue;
    const id = cellId(column, row);
    totals.set(id, (totals.get(id) ?? 0) + point.value);
  }
  return totals;
}

function fillGrid(
  columns: readonly string[],
  rows: readonly string[],
  totals: ReadonlyMap<string, number>,
): HeatmapBin[] {
  const bins: HeatmapBin[] = [];
  for (const row of rows) {
    for (const column of columns) {
      bins.push({ column, row, value: totals.get(cellId(column, row)) ?? 0 });
    }
  }
  return bins;
}

function cellId(column: string, row: string): string {
  return `${column}\0${row}`;
}

/**
 * 45° diagonal through `origin` on the top edge, clipped to the cell.
 * Line is `(origin + t * height, cell.y + height - t * height)` for `t` in `[0, 1]`.
 */
function clipDiagonal(
  origin: number,
  cell: Pick<HeatmapCell, "x" | "y" | "width" | "height">,
): HatchSegment | undefined {
  const height = cell.height;
  const tEnter = (cell.x - origin) / height;
  const tLeave = (cell.x + cell.width - origin) / height;
  const from = Math.max(0, tEnter);
  const to = Math.min(1, tLeave);
  if (to <= from) return undefined;
  return {
    x1: origin + from * height,
    y1: cell.y + cell.height - from * height,
    x2: origin + to * height,
    y2: cell.y + cell.height - to * height,
  };
}
