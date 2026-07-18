/**
 * The data both resolution paths render, and the replacement they swap to.
 *
 * Non-uniform on purpose. Under the `zero-floor` policy a uniform rescale maps
 * to identical pixels, and a two-point series occupies the same two pixels
 * whatever its values — so a reactivity check built on either cannot tell a live
 * chart from a frozen one, and would not say so.
 */
export interface Point {
  t: Date;
  y: number;
}

export const initial: Point[] = [
  { t: new Date("2026-01-01T00:00:00Z"), y: 12 },
  { t: new Date("2026-01-02T00:00:00Z"), y: 18 },
  { t: new Date("2026-01-03T00:00:00Z"), y: 9 },
  { t: new Date("2026-01-04T00:00:00Z"), y: 22 },
  { t: new Date("2026-01-05T00:00:00Z"), y: 27 },
];

export const replacement: Point[] = [
  { t: new Date("2026-01-01T00:00:00Z"), y: 90 },
  { t: new Date("2026-01-02T00:00:00Z"), y: 31 },
  { t: new Date("2026-01-03T00:00:00Z"), y: 77 },
  { t: new Date("2026-01-04T00:00:00Z"), y: 14 },
  { t: new Date("2026-01-05T00:00:00Z"), y: 63 },
];
