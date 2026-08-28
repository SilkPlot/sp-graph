/**
 * Hierarchy layout — tree, treemap, and pack positions as data.
 *
 * Geometry is asserted as values, the same way `layoutPie` asserts slices: a
 * node test walks the compute, never a rendered tree. Force-directed is not
 * computed here.
 */
import { describe, expect, it } from "vitest";
import {
  HIERARCHY_PATTERN_COUNT,
  PACK_PADDING,
  TREE_HIT_RADIUS,
  TREE_PADDING,
  TREEMAP_PADDING_INNER,
  TREEMAP_PADDING_TOP,
  computeHierarchy,
  createPackIndex,
  createTreeIndex,
  createTreemapIndex,
  hierarchyPatternIndex,
  hierarchyValue,
  layoutPackFromObservations,
  layoutTreeFromObservations,
  layoutTreemapFromObservations,
  locatePackNode,
  locateTreeNode,
  locateTreemapNode,
  pointInPackNode,
  pointInTreemapNode,
} from "../src/index";
import type { HierarchyObservation } from "../src/index";

const ORG: HierarchyObservation[] = [
  { id: "clinic", value: 0 },
  { id: "north", parent: "clinic", value: 0 },
  { id: "south", parent: "clinic", value: 0 },
  { id: "n1", parent: "north", value: 10 },
  { id: "n2", parent: "north", value: 20 },
  { id: "s1", parent: "south", value: 30 },
];

const BOX = { width: 200, height: 100 };

describe("hierarchyValue and hierarchyPatternIndex", () => {
  it("treats missing, non-finite, zero, and negative as 0", () => {
    expect(hierarchyValue(undefined)).toBe(0);
    expect(hierarchyValue(Number.NaN)).toBe(0);
    expect(hierarchyValue(Number.POSITIVE_INFINITY)).toBe(0);
    expect(hierarchyValue(0)).toBe(0);
    expect(hierarchyValue(-4)).toBe(0);
    expect(hierarchyValue(12)).toBe(12);
  });

  it("wraps into the catalog, including negatives", () => {
    expect(hierarchyPatternIndex(0)).toBe(0);
    expect(hierarchyPatternIndex(HIERARCHY_PATTERN_COUNT)).toBe(0);
    expect(hierarchyPatternIndex(HIERARCHY_PATTERN_COUNT + 1)).toBe(1);
    expect(hierarchyPatternIndex(-1)).toBe(HIERARCHY_PATTERN_COUNT - 1);
  });
});

describe("computeHierarchy", () => {
  it("walks a parent/id table in preorder and keeps zero-value structure nodes", () => {
    const parts = computeHierarchy(ORG);
    // d3-hierarchy `descendants()` is breadth-first (each generation, then the next).
    expect(parts.map((p) => p.id)).toEqual(["clinic", "north", "south", "n1", "n2", "s1"]);
    expect(parts[0]?.parent).toBeNull();
    expect(parts[0]?.depth).toBe(0);
    expect(parts[1]?.parent).toBe("clinic");
    expect(parts[1]?.depth).toBe(1);
    expect(parts[3]?.depth).toBe(2);
    expect(parts[3]?.id).toBe("n1");
    expect(parts[3]?.value).toBe(10);
    expect(parts[0]?.value).toBe(0);
    expect(parts[3]?.sourceIndex).toBe(3);
    expect(parts[0]?.pattern).toBe(0);
    expect(parts[1]?.pattern).toBe(1);
  });

  it("treats a missing parent, an unknown parent, and a self-parent as roots", () => {
    const parts = computeHierarchy([
      { id: "a" },
      { id: "b", parent: "gone", value: 4 },
      { id: "c", parent: "c", value: 1 },
    ]);
    expect(parts.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
    expect(parts.every((p) => p.parent === null)).toBe(true);
    expect(parts.every((p) => p.depth === 0)).toBe(true);
    expect(parts.find((p) => p.id === "a")?.value).toBe(0);
  });

  it("keeps the first duplicate id and skips an empty id", () => {
    const parts = computeHierarchy([
      { id: "a", value: 1 },
      { id: "", value: 9 },
      { id: "a", value: 8 },
      { id: "b", parent: "a", value: 2 },
    ]);
    expect(parts.map((p) => p.id)).toEqual(["a", "b"]);
    expect(parts[0]?.value).toBe(1);
    expect(parts[0]?.sourceIndex).toBe(0);
  });

  it("returns empty for a cycle that cannot be stratified", () => {
    expect(
      computeHierarchy([
        { id: "a", parent: "b", value: 1 },
        { id: "b", parent: "a", value: 1 },
      ]),
    ).toEqual([]);
  });

  it("returns empty when nothing with an id survives", () => {
    expect(computeHierarchy([])).toEqual([]);
    expect(computeHierarchy([{ id: "", value: 4 }])).toEqual([]);
  });
});

describe("layoutTreeFromObservations", () => {
  it("places the root above its children and emits one link per child", () => {
    const { nodes, links } = layoutTreeFromObservations(ORG, BOX);
    expect(nodes).toHaveLength(6);
    expect(links).toHaveLength(5);
    const clinic = nodes.find((n) => n.id === "clinic")!;
    const north = nodes.find((n) => n.id === "north")!;
    const n1 = nodes.find((n) => n.id === "n1")!;
    expect(clinic.y).toBeLessThan(north.y);
    expect(north.y).toBeLessThan(n1.y);
    expect(north.x).not.toBe(nodes.find((n) => n.id === "south")!.x);
    expect(clinic.x).toBeGreaterThanOrEqual(TREE_PADDING);
    expect(clinic.x).toBeLessThanOrEqual(BOX.width - TREE_PADDING);
    expect(links.some((l) => l.sourceId === "clinic" && l.targetId === "north")).toBe(true);
  });

  it("still positions a zero-value leaf", () => {
    const { nodes } = layoutTreeFromObservations(
      [
        { id: "root", value: 0 },
        { id: "leaf", parent: "root", value: 0 },
      ],
      BOX,
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[1]?.id).toBe("leaf");
    expect(nodes[1]?.x).toBeGreaterThan(0);
  });

  it("replacing the data produces a different node set", () => {
    const before = layoutTreeFromObservations(ORG, BOX);
    const after = layoutTreeFromObservations(
      [
        { id: "clinic", value: 1 },
        { id: "east", parent: "clinic", value: 2 },
      ],
      BOX,
    );
    expect(after.nodes.map((n) => n.id)).toEqual(["clinic", "east"]);
    expect(after.nodes.map((n) => n.id)).not.toEqual(before.nodes.map((n) => n.id));
    expect(after.links).toHaveLength(1);
  });
});

describe("layoutTreemapFromObservations", () => {
  it("fills the plot with positive-area rects and keeps parent larger than a child", () => {
    const nodes = layoutTreemapFromObservations(ORG, BOX);
    expect(nodes.length).toBeGreaterThan(1);
    const clinic = nodes.find((n) => n.id === "clinic")!;
    const n1 = nodes.find((n) => n.id === "n1")!;
    expect(clinic.width * clinic.height).toBeGreaterThan(n1.width * n1.height);
    expect(clinic.width).toBeGreaterThan(0);
    expect(n1.width).toBeGreaterThan(0);
    expect(pointInTreemapNode(clinic, n1.x + n1.width / 2, n1.y + n1.height / 2)).toBe(true);
    expect(TREEMAP_PADDING_INNER).toBeGreaterThan(0);
    expect(TREEMAP_PADDING_TOP).toBeGreaterThan(0);
  });

  it("drops a tree whose values are all zero or missing", () => {
    expect(layoutTreemapFromObservations([{ id: "a", value: 0 }], BOX)).toEqual([]);
    expect(layoutTreemapFromObservations([{ id: "a" }], BOX)).toEqual([]);
    expect(layoutTreemapFromObservations(ORG, { width: 0, height: 100 })).toEqual([]);
  });

  it("gives a larger leaf more area than a smaller sibling", () => {
    const nodes = layoutTreemapFromObservations(
      [
        { id: "root", value: 0 },
        { id: "small", parent: "root", value: 1 },
        { id: "large", parent: "root", value: 9 },
      ],
      { width: 400, height: 400 },
    );
    const small = nodes.find((n) => n.id === "small")!;
    const large = nodes.find((n) => n.id === "large")!;
    expect(large.width * large.height).toBeGreaterThan(small.width * small.height);
  });
});

describe("layoutPackFromObservations", () => {
  it("places children inside the parent circle", () => {
    const nodes = layoutPackFromObservations(ORG, BOX);
    const clinic = nodes.find((n) => n.id === "clinic")!;
    const n1 = nodes.find((n) => n.id === "n1")!;
    expect(clinic.r).toBeGreaterThan(n1.r);
    expect(pointInPackNode(clinic, n1.x, n1.y)).toBe(true);
    expect(PACK_PADDING).toBeGreaterThan(0);
  });

  it("drops a zero-sum hierarchy and a collapsed plot", () => {
    expect(layoutPackFromObservations([{ id: "a", value: 0 }], BOX)).toEqual([]);
    expect(layoutPackFromObservations(ORG, { width: 200, height: 0 })).toEqual([]);
  });

  it("replacing the data moves radii", () => {
    const before = layoutPackFromObservations(ORG, BOX);
    const after = layoutPackFromObservations(
      [
        { id: "clinic", value: 1 },
        { id: "east", parent: "clinic", value: 80 },
      ],
      BOX,
    );
    expect(after.map((n) => n.id)).toEqual(["clinic", "east"]);
    expect(after[1]?.r).not.toBe(before.find((n) => n.id === "n1")?.r);
  });
});

describe("locate and indexes", () => {
  const tree = layoutTreeFromObservations(ORG, BOX);
  const treemap = layoutTreemapFromObservations(ORG, BOX);
  const pack = layoutPackFromObservations(ORG, BOX);

  it("hits a tree node at its centre and misses outside the radius", () => {
    const first = tree.nodes[0] as (typeof tree.nodes)[number];
    expect(locateTreeNode(tree.nodes, first.x, first.y)).toBe(0);
    expect(locateTreeNode(tree.nodes, first.x + TREE_HIT_RADIUS + 4, first.y)).toBe(-1);
    expect(locateTreeNode([], 0, 0)).toBe(-1);
  });

  it("lets a treemap child win over the parent that contains it", () => {
    const leaf = treemap.find((n) => n.id === "n1")!;
    const parent = treemap.find((n) => n.id === "clinic")!;
    const ordinal = locateTreemapNode(treemap, leaf.x + leaf.width / 2, leaf.y + leaf.height / 2);
    expect(treemap[ordinal]?.id).toBe("n1");
    expect(pointInTreemapNode(parent, leaf.x + leaf.width / 2, leaf.y + leaf.height / 2)).toBe(true);
    expect(locateTreemapNode(treemap, -10, -10)).toBe(-1);
  });

  it("lets a pack leaf win over the enclosing parent", () => {
    const leaf = pack.find((n) => n.id === "n1")!;
    const ordinal = locatePackNode(pack, leaf.x, leaf.y);
    expect(pack[ordinal]?.id).toBe("n1");
    expect(locatePackNode(pack, -10, -10)).toBe(-1);
  });

  it("lets pointer and keyboard resolve the same tree record", () => {
    const index = createTreeIndex(tree.nodes, "org");
    expect(index.length).toBe(6);
    expect(index.at(-1)).toBeUndefined();
    expect(index.at(6)).toBeUndefined();
    const first = tree.nodes[0] as (typeof tree.nodes)[number];
    const ordinal = index.locate(first.x, first.y);
    expect(ordinal).toBe(0);
    const record = index.at(ordinal);
    expect(record?.seriesId).toBe("org");
    expect(record?.datum).toEqual({ id: "clinic", parent: null, value: 0 });
    expect(record?.at).toEqual({ kind: "category", category: "clinic" });
    expect(record?.sourceIndex).toBe(0);
    expect(record?.position.x).toBe(first.x);
  });

  it("defaults the series id and shares locate with the treemap and pack indexes", () => {
    expect(createTreeIndex(tree.nodes).at(0)?.seriesId).toBe("tree");
    const leaf = treemap.find((n) => n.id === "s1")!;
    const treemapIndex = createTreemapIndex(treemap);
    expect(treemapIndex.at(treemapIndex.locate(leaf.x + leaf.width / 2, leaf.y + leaf.height / 2))?.datum.id).toBe(
      "s1",
    );
    expect(createTreemapIndex(treemap).at(0)?.seriesId).toBe("treemap");
    const packed = pack.find((n) => n.id === "s1")!;
    const packIndex = createPackIndex(pack);
    expect(packIndex.at(packIndex.locate(packed.x, packed.y))?.datum.id).toBe("s1");
    expect(createPackIndex(pack).at(0)?.seriesId).toBe("pack");
  });
});
