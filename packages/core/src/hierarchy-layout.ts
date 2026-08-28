/**
 * Hierarchy layout — tree, treemap, and pack as data.
 *
 * There is no DOM here. Charts paint the nodes; they do not re-derive
 * positions. Input is tabular `{ id, parent, value }` (one node per row).
 * Colour is a render concern. The non-colour channels are a fill-pattern
 * index (aligned with the categorical palette) and the node id, so colour
 * cannot uniquely encode.
 *
 * Force-directed is a signed backlog type. It is not computed here; the
 * frame-budget record lives beside the tests.
 */
import {
  pack as d3Pack,
  stratify,
  tree as d3Tree,
  treemap as d3Treemap,
  type HierarchyCircularNode,
  type HierarchyNode,
  type HierarchyPointNode,
  type HierarchyRectangularNode,
} from "d3-hierarchy";
import type { ActivePoint, ActivePointIndex } from "./active-point";
import { createHitIndex } from "./hit-test";
import { SERIES_PALETTE_SIZE } from "./series-style";

/** One observation. `parent` absent, null, or `""` is a root. */
export interface HierarchyObservation {
  id: string;
  parent?: string | null;
  value?: number;
}

/** The public datum a hover, selection, or table row carries. */
export interface HierarchyDatum {
  id: string;
  parent: string | null;
  value: number;
}

/** One included node, in data space: identity and depth, no pixels. */
export interface HierarchyPart extends HierarchyDatum {
  /** Index into the caller's observation array (ADR-0008 §5). */
  sourceIndex: number;
  depth: number;
  /** Fill-pattern slot, wrapped into `HIERARCHY_PATTERN_COUNT`. */
  pattern: number;
}

export interface LayoutHierarchyOptions {
  width: number;
  height: number;
}

/** One painted tree node, in inner-plot pixels. */
export interface TreeNode extends HierarchyPart {
  x: number;
  y: number;
}

export interface TreeLink {
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: readonly TreeNode[];
  links: readonly TreeLink[];
}

/** One painted treemap node, in inner-plot pixels. */
export interface TreemapNode extends HierarchyPart {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One painted pack node, in inner-plot pixels. */
export interface PackNode extends HierarchyPart {
  x: number;
  y: number;
  r: number;
}

/** Pattern slots; matches the categorical palette so colour and pattern wrap together. */
export const HIERARCHY_PATTERN_COUNT = SERIES_PALETTE_SIZE;

/** Inset so a tree node at the layout edge is not clipped to a half-disk. */
export const TREE_PADDING = 24;

/** Pointer radius around a tree node centre, in inner-plot pixels. */
export const TREE_HIT_RADIUS = 16;

/** Gap between treemap sibling rects. */
export const TREEMAP_PADDING_INNER = 2;

/** Parent label band on a treemap cell. */
export const TREEMAP_PADDING_TOP = 16;

/** Gap between pack sibling circles. */
export const PACK_PADDING = 3;

interface Prepared {
  id: string;
  parent: string | null;
  layoutParent: string | null;
  value: number;
  sourceIndex: number;
}

/** Wrap an index into the pattern catalog, including negatives. */
export function hierarchyPatternIndex(i: number): number {
  return ((i % HIERARCHY_PATTERN_COUNT) + HIERARCHY_PATTERN_COUNT) % HIERARCHY_PATTERN_COUNT;
}

/**
 * Positive finite value, else 0. Missing, zero, negative, and non-finite
 * values do not contribute to treemap/pack area.
 */
export function hierarchyValue(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function unusedId(ids: ReadonlySet<string>): string {
  let id = "\0";
  while (ids.has(id)) id += "\0";
  return id;
}

/**
 * Deduplicate by id (first wins), drop empty ids, treat a missing parent as
 * a root, and treat a parent that is not in the set as a root. Self-parent
 * is a root rather than a cycle.
 */
function prepareHierarchy(observations: readonly HierarchyObservation[]): Prepared[] {
  const seen = new Set<string>();
  const rows: Prepared[] = [];
  for (let i = 0; i < observations.length; i += 1) {
    const observation = observations[i] as HierarchyObservation;
    const id = observation.id;
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    const rawParent = observation.parent;
    const parent = rawParent === undefined || rawParent === null || rawParent === "" || rawParent === id ? null : rawParent;
    rows.push({
      id,
      parent,
      layoutParent: parent,
      value: hierarchyValue(observation.value),
      sourceIndex: i,
    });
  }
  const ids = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    if (row.parent !== null && !ids.has(row.parent)) {
      row.parent = null;
      row.layoutParent = null;
    }
  }
  const roots = rows.filter((row) => row.layoutParent === null);
  if (roots.length <= 1) return rows;
  const virtual = unusedId(ids);
  for (const row of rows) {
    if (row.layoutParent === null) row.layoutParent = virtual;
  }
  rows.unshift({
    id: virtual,
    parent: null,
    layoutParent: null,
    value: 0,
    sourceIndex: -1,
  });
  return rows;
}

function isVirtual(row: Prepared): boolean {
  return row.sourceIndex < 0;
}

function stratifyPrepared(rows: readonly Prepared[]): HierarchyNode<Prepared> | undefined {
  if (rows.length === 0 || (rows.length === 1 && isVirtual(rows[0] as Prepared))) return undefined;
  try {
    return stratify<Prepared>()
      .id((d) => d.id)
      .parentId((d) => d.layoutParent)(rows as Prepared[]);
  } catch {
    return undefined;
  }
}

function depthOffset(root: HierarchyNode<Prepared>): number {
  return isVirtual(root.data) ? 1 : 0;
}

function partOf(node: HierarchyNode<Prepared>, pattern: number, offset: number): HierarchyPart {
  return {
    id: node.data.id,
    parent: node.data.parent,
    value: node.data.value,
    sourceIndex: node.data.sourceIndex,
    depth: node.depth - offset,
    pattern: hierarchyPatternIndex(pattern),
  };
}

function walkParts(root: HierarchyNode<Prepared>): HierarchyPart[] {
  const offset = depthOffset(root);
  const parts: HierarchyPart[] = [];
  let pattern = 0;
  for (const node of root.descendants()) {
    if (isVirtual(node.data)) continue;
    parts.push(partOf(node, pattern, offset));
    pattern += 1;
  }
  return parts;
}

/**
 * Include every distinct id, in breadth-first order. Zero and missing values
 * stay as nodes with value 0 — tree structure does not drop them. A cycle or a
 * duplicate that stratify cannot parent returns empty.
 */
export function computeHierarchy(observations: readonly HierarchyObservation[]): readonly HierarchyPart[] {
  const root = stratifyPrepared(prepareHierarchy(observations));
  if (root === undefined) return [];
  return walkParts(root);
}

function treeSize(options: LayoutHierarchyOptions): { innerWidth: number; innerHeight: number } {
  return {
    innerWidth: Math.max(0, options.width - TREE_PADDING * 2),
    innerHeight: Math.max(0, options.height - TREE_PADDING * 2),
  };
}

function treeLinks(nodes: readonly TreeNode[]): TreeLink[] {
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) byId.set(node.id, node);
  const links: TreeLink[] = [];
  for (const node of nodes) {
    if (node.parent === null) continue;
    const parent = byId.get(node.parent);
    if (parent === undefined) continue;
    links.push({
      sourceId: parent.id,
      targetId: node.id,
      x1: parent.x,
      y1: parent.y,
      x2: node.x,
      y2: node.y,
    });
  }
  return links;
}

function layoutTreeRoot(root: HierarchyNode<Prepared>, options: LayoutHierarchyOptions): TreeLayout {
  const { innerWidth, innerHeight } = treeSize(options);
  const laid = d3Tree<Prepared>().size([innerWidth, innerHeight])(root);
  const offset = depthOffset(root);
  const nodes: TreeNode[] = [];
  let pattern = 0;
  for (const node of laid.descendants() as HierarchyPointNode<Prepared>[]) {
    if (isVirtual(node.data)) continue;
    nodes.push({
      ...partOf(node, pattern, offset),
      x: TREE_PADDING + node.x,
      y: TREE_PADDING + node.y,
    });
    pattern += 1;
  }
  return { nodes, links: treeLinks(nodes) };
}

/** Reingold–Tilford node-link positions in inner-plot pixels. */
export function layoutTreeFromObservations(
  observations: readonly HierarchyObservation[],
  options: LayoutHierarchyOptions,
): TreeLayout {
  const root = stratifyPrepared(prepareHierarchy(observations));
  if (root === undefined) return { nodes: [], links: [] };
  return layoutTreeRoot(root, options);
}

function valuedRoot(observations: readonly HierarchyObservation[]): HierarchyNode<Prepared> | undefined {
  const root = stratifyPrepared(prepareHierarchy(observations));
  if (root === undefined) return undefined;
  root.sum((d) => d.value);
  if (!(root.value !== undefined && root.value > 0)) return undefined;
  root.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return root;
}

/** Squarified treemap rects. Zero-area nodes are dropped. */
export function layoutTreemapFromObservations(
  observations: readonly HierarchyObservation[],
  options: LayoutHierarchyOptions,
): readonly TreemapNode[] {
  const root = valuedRoot(observations);
  if (root === undefined || !(options.width > 0) || !(options.height > 0)) return [];
  const laid = d3Treemap<Prepared>()
    .size([options.width, options.height])
    .paddingInner(TREEMAP_PADDING_INNER)
    .paddingTop(TREEMAP_PADDING_TOP)
    .round(true)(root);
  const offset = depthOffset(root);
  const nodes: TreemapNode[] = [];
  let pattern = 0;
  for (const node of laid.descendants() as HierarchyRectangularNode<Prepared>[]) {
    if (isVirtual(node.data)) continue;
    const width = node.x1 - node.x0;
    const height = node.y1 - node.y0;
    if (!(width > 0) || !(height > 0)) continue;
    nodes.push({
      ...partOf(node, pattern, offset),
      x: node.x0,
      y: node.y0,
      width,
      height,
    });
    pattern += 1;
  }
  return nodes;
}

/** Circle-pack positions. Zero-radius nodes are dropped. */
export function layoutPackFromObservations(
  observations: readonly HierarchyObservation[],
  options: LayoutHierarchyOptions,
): readonly PackNode[] {
  const root = valuedRoot(observations);
  if (root === undefined || !(options.width > 0) || !(options.height > 0)) return [];
  const laid = d3Pack<Prepared>().size([options.width, options.height]).padding(PACK_PADDING)(root);
  const offset = depthOffset(root);
  const nodes: PackNode[] = [];
  let pattern = 0;
  for (const node of laid.descendants() as HierarchyCircularNode<Prepared>[]) {
    if (isVirtual(node.data)) continue;
    if (!(node.r > 0)) continue;
    nodes.push({
      ...partOf(node, pattern, offset),
      x: node.x,
      y: node.y,
      r: node.r,
    });
    pattern += 1;
  }
  return nodes;
}

export function pointInTreemapNode(node: TreemapNode, px: number, py: number): boolean {
  return px >= node.x && px < node.x + node.width && py >= node.y && py < node.y + node.height;
}

export function pointInPackNode(node: PackNode, px: number, py: number): boolean {
  const dx = px - node.x;
  const dy = py - node.y;
  return dx * dx + dy * dy <= node.r * node.r;
}

/** Nearest tree node within `TREE_HIT_RADIUS`, or -1. */
export function locateTreeNode(nodes: readonly TreeNode[], px: number, py: number): number {
  if (nodes.length === 0) return -1;
  const hit = createHitIndex(nodes, {
    x: (node) => node.x,
    y: (node) => node.y,
  });
  const ordinal = hit.nearest(px, py);
  if (ordinal < 0) return -1;
  const node = nodes[ordinal] as TreeNode;
  if (Math.hypot(px - node.x, py - node.y) > TREE_HIT_RADIUS) return -1;
  return ordinal;
}

/**
 * Deepest containing treemap rect. Reverse breadth-first so a child wins over
 * the parent that encloses it.
 */
export function locateTreemapNode(nodes: readonly TreemapNode[], px: number, py: number): number {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (pointInTreemapNode(nodes[i] as TreemapNode, px, py)) return i;
  }
  return -1;
}

/** Smallest containing pack circle (reverse breadth-first, children before parent). */
export function locatePackNode(nodes: readonly PackNode[], px: number, py: number): number {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (pointInPackNode(nodes[i] as PackNode, px, py)) return i;
  }
  return -1;
}

function createNodeIndex<N extends HierarchyPart>(
  nodes: readonly N[],
  seriesId: string,
  locate: (px: number, py: number) => number,
  position: (node: N) => { x: number; y: number },
): ActivePointIndex<HierarchyDatum> {
  const at = (ordinal: number): ActivePoint<HierarchyDatum> | undefined => {
    if (ordinal < 0 || ordinal >= nodes.length) return undefined;
    const node = nodes[ordinal] as N;
    return {
      seriesId,
      sourceIndex: node.sourceIndex,
      datum: { id: node.id, parent: node.parent, value: node.value },
      position: position(node),
      at: { kind: "category", category: node.id },
    };
  };
  return { length: nodes.length, at, locate };
}

export function createTreeIndex(
  nodes: readonly TreeNode[],
  seriesId = "tree",
): ActivePointIndex<HierarchyDatum> {
  const hit = createHitIndex(nodes, {
    x: (node) => node.x,
    y: (node) => node.y,
  });
  return createNodeIndex(
    nodes,
    seriesId,
    (px, py) => {
      const ordinal = hit.nearest(px, py);
      if (ordinal < 0) return -1;
      const node = nodes[ordinal] as TreeNode;
      if (Math.hypot(px - node.x, py - node.y) > TREE_HIT_RADIUS) return -1;
      return ordinal;
    },
    (node) => ({ x: node.x, y: node.y }),
  );
}

export function createTreemapIndex(
  nodes: readonly TreemapNode[],
  seriesId = "treemap",
): ActivePointIndex<HierarchyDatum> {
  return createNodeIndex(
    nodes,
    seriesId,
    (px, py) => locateTreemapNode(nodes, px, py),
    (node) => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 }),
  );
}

export function createPackIndex(
  nodes: readonly PackNode[],
  seriesId = "pack",
): ActivePointIndex<HierarchyDatum> {
  return createNodeIndex(
    nodes,
    seriesId,
    (px, py) => locatePackNode(nodes, px, py),
    (node) => ({ x: node.x, y: node.y }),
  );
}
