/**
 * The visible viewport model — ADR-0014 §3/§4 on ADR-0017's representation.
 *
 * These are pure interval-arithmetic proofs: no Solid, no DOM. They pin the two
 * clamp behaviours apart (intersect vs slide), the min-span floor, the
 * anchored zoom, the reset, and the one data-change reconciliation rule that
 * generates §4's growth / replacement / disjoint column. The reactive holder's
 * controlled/uncontrolled and callback behaviour is proved in the solid suite;
 * the autoscale-over-visible-values proof lives here because it is a pure
 * function of normalized series.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_SPAN_MS,
  toMsInterval,
  toTimeInterval,
  spanOf,
  isFiniteInterval,
  intervalsEqualMs,
  isDisjoint,
  normalizeInterval,
  clampInterval,
  slideIntoBound,
  applyMinSpan,
  translateInterval,
  scaleIntervalAround,
  resetInterval,
  reconcileDataChange,
  autoscaleValueDomain,
  normalizeSeries,
  type MsInterval,
  type Series,
} from "../src/index";

const ms = (start: number, end: number): MsInterval => ({ start, end });
const BOUND = ms(0, 1000);

describe("conversion — the only Date↔ms crossing (ADR-0017)", () => {
  it("round-trips a Date interval through epoch-ms and back", () => {
    const t: { start: Date; end: Date } = {
      start: new Date("2026-03-01T00:00:00Z"),
      end: new Date("2026-03-02T00:00:00Z"),
    };
    const asMs = toMsInterval(t);
    expect(asMs).toEqual({ start: t.start.getTime(), end: t.end.getTime() });
    const back = toTimeInterval(asMs);
    expect(back.start.getTime()).toBe(t.start.getTime());
    expect(back.end.getTime()).toBe(t.end.getTime());
  });
});

describe("predicates", () => {
  it("spanOf is the width, negative when reversed", () => {
    expect(spanOf(ms(10, 40))).toBe(30);
    expect(spanOf(ms(40, 10))).toBe(-30);
  });

  it("isFiniteInterval rejects a non-finite end", () => {
    expect(isFiniteInterval(ms(0, 100))).toBe(true);
    expect(isFiniteInterval(ms(0, Number.NaN))).toBe(false);
    expect(isFiniteInterval(ms(Number.POSITIVE_INFINITY, 100))).toBe(false);
  });

  it("intervalsEqualMs is the echo test — exact ms on both ends", () => {
    expect(intervalsEqualMs(ms(1, 2), ms(1, 2))).toBe(true);
    expect(intervalsEqualMs(ms(1, 2), ms(9, 2))).toBe(false);
    expect(intervalsEqualMs(ms(1, 2), ms(1, 9))).toBe(false);
  });

  it("isDisjoint is true only with no shared instant", () => {
    expect(isDisjoint(ms(1100, 1200), BOUND)).toBe(true); // wholly right
    expect(isDisjoint(ms(-200, -100), BOUND)).toBe(true); // wholly left
    expect(isDisjoint(ms(900, 1100), BOUND)).toBe(false); // overlaps
    // Touching at exactly one instant is disjoint here (`<=`/`>=`): a window
    // that only meets the edge has no width inside the bound to draw.
    expect(isDisjoint(ms(1000, 1100), BOUND)).toBe(true);
  });

  it("normalizeInterval orders a reversed (right-to-left) interval, passes a normal one", () => {
    expect(normalizeInterval(ms(40, 10))).toEqual(ms(10, 40));
    const normal = ms(10, 40);
    expect(normalizeInterval(normal)).toBe(normal);
  });
});

describe("clampInterval — intersect INTO the bound (ADR-0014 §4 replacement)", () => {
  it("trims a window hanging off both edges", () => {
    expect(clampInterval(ms(-50, 1200), BOUND)).toEqual(ms(0, 1000));
  });

  it("leaves a window already inside the (wider) bound untouched — the growth case", () => {
    const inside = ms(200, 400);
    expect(clampInterval(inside, ms(-100, 5000))).toEqual(inside);
  });

  it("produces an empty (start >= end) result when disjoint", () => {
    const r = clampInterval(ms(1100, 1200), BOUND);
    expect(r.start >= r.end).toBe(true);
  });
});

describe("slideIntoBound — preserve span, translate to fit (pan/zoom-out clamp)", () => {
  it("returns the whole bound when the interval is at least as wide", () => {
    expect(slideIntoBound(ms(-100, 2000), BOUND)).toEqual(ms(0, 1000));
    expect(slideIntoBound(ms(0, 1000), BOUND)).toEqual(ms(0, 1000));
  });

  it("slides a window off the LEFT back to the left edge, keeping its span", () => {
    expect(slideIntoBound(ms(-100, 100), BOUND)).toEqual(ms(0, 200));
  });

  it("slides a window off the RIGHT back to the right edge, keeping its span", () => {
    expect(slideIntoBound(ms(950, 1150), BOUND)).toEqual(ms(800, 1000));
  });

  it("passes a window already inside through unchanged", () => {
    const inside = ms(300, 500);
    expect(slideIntoBound(inside, BOUND)).toBe(inside);
  });
});

describe("applyMinSpan — floor the zoom (ADR-0014 §3)", () => {
  it("leaves a window at or above the floor untouched", () => {
    const wide = ms(200, 400);
    expect(applyMinSpan(wide, 100, BOUND)).toBe(wide);
  });

  it("widens a zero-width request up to the floor, centred", () => {
    expect(applyMinSpan(ms(500, 500), 100, BOUND)).toEqual(ms(450, 550));
  });

  it("widens then slides back inside the bound when the floor overhangs an edge", () => {
    // Centred at 980 with floor 100 would reach 1030; slid back to the edge.
    expect(applyMinSpan(ms(980, 980), 100, BOUND)).toEqual(ms(900, 1000));
  });

  it("returns the whole bound when the bound is narrower than the floor", () => {
    expect(applyMinSpan(ms(10, 10), 100, ms(0, 50))).toEqual(ms(0, 50));
  });

  it("treats a negative floor as zero (no widening)", () => {
    const tiny = ms(10, 10);
    expect(applyMinSpan(tiny, -5, BOUND)).toBe(tiny);
  });
});

describe("translateInterval — pan, clamped at the edge (ADR-0014 §5)", () => {
  it("pans later within the bound", () => {
    expect(translateInterval(ms(100, 300), 200, BOUND)).toEqual(ms(300, 500));
  });

  it("pans earlier within the bound", () => {
    expect(translateInterval(ms(300, 500), -200, BOUND)).toEqual(ms(100, 300));
  });

  it("stops at the right edge rather than scrolling into nothing, keeping the span", () => {
    expect(translateInterval(ms(800, 1000), 500, BOUND)).toEqual(ms(800, 1000));
  });

  it("stops at the left edge", () => {
    expect(translateInterval(ms(0, 200), -500, BOUND)).toEqual(ms(0, 200));
  });
});

describe("scaleIntervalAround — anchored zoom (ADR-0014 §5, §7)", () => {
  it("zooms IN about an anchor, holding the anchor instant fixed", () => {
    // factor 0.5 about the centre 400 of [200,600] → half the span, same centre.
    expect(scaleIntervalAround(ms(200, 600), 0.5, 400, BOUND)).toEqual(ms(300, 500));
  });

  it("holds a non-centre anchor fixed", () => {
    // Anchor at the left end: only the right end moves in.
    expect(scaleIntervalAround(ms(200, 600), 0.5, 200, BOUND)).toEqual(ms(200, 400));
  });

  it("zooms OUT and clamps to the bound rather than widening past the extent", () => {
    expect(scaleIntervalAround(ms(400, 600), 10, 500, BOUND)).toEqual(ms(0, 1000));
  });

  it("applies the min-span floor to a deep zoom-in", () => {
    // [400,600] scaled by 0.001 about its centre 500 → a 0.2ms sliver centred on
    // 500; the floor 100 widens it back about that centre.
    expect(scaleIntervalAround(ms(400, 600), 0.001, 500, BOUND, 100)).toEqual(ms(450, 550));
  });

  it("defaults the floor to DEFAULT_MIN_SPAN_MS", () => {
    // With the 1ms default the zoom-in is not floored above its own width.
    const r = scaleIntervalAround(ms(400, 600), 0.5, 500, BOUND);
    expect(spanOf(r)).toBe(100);
    expect(DEFAULT_MIN_SPAN_MS).toBe(1);
  });
});

describe("resetInterval — restore the declared domain (ADR-0014 §3)", () => {
  it("returns the bound when no default is declared", () => {
    expect(resetInterval(undefined, BOUND)).toEqual(ms(0, 1000));
  });

  it("returns the declared default when it lies inside the bound", () => {
    expect(resetInterval(ms(200, 400), BOUND)).toEqual(ms(200, 400));
  });

  it("clamps a default that overhangs the bound", () => {
    expect(resetInterval(ms(-100, 400), BOUND)).toEqual(ms(0, 400));
  });

  it("falls back to the bound when the declared default is disjoint from it", () => {
    expect(resetInterval(ms(2000, 3000), BOUND)).toEqual(ms(0, 1000));
  });
});

describe("reconcileDataChange — ADR-0014 §4's data column, one rule", () => {
  it("keeps the interval and fires nothing on GROWTH (new extent contains the old)", () => {
    // Same window, extent grew to the right; not auto-scrolled to the new edge.
    expect(reconcileDataChange(ms(200, 400), ms(0, 5000))).toBeNull();
  });

  it("trims the interval into a SHRUNK extent and labels the cause replacement", () => {
    const r = reconcileDataChange(ms(200, 1200), ms(0, 800));
    expect(r).toEqual({ interval: ms(200, 800), cause: "replacement" });
  });

  it("RESETS to the declared default when the window is now disjoint", () => {
    const r = reconcileDataChange(ms(2000, 3000), ms(0, 1000), ms(100, 300));
    expect(r).toEqual({ interval: ms(100, 300), cause: "replacement" });
  });

  it("resets to the new extent when disjoint and no default is declared", () => {
    const r = reconcileDataChange(ms(2000, 3000), ms(0, 1000));
    expect(r).toEqual({ interval: ms(0, 1000), cause: "replacement" });
  });

  it("floors a trimmed window to min-span", () => {
    // The window trims to a sliver at the new right edge; min-span widens it.
    const r = reconcileDataChange(ms(995, 1200), ms(0, 1000), undefined, 100);
    expect(r?.interval).toEqual(ms(900, 1000));
  });

  it("returns null when a same-source no-op leaves the window unmoved", () => {
    expect(reconcileDataChange(ms(200, 400), ms(0, 1000))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Autoscale — value extent over the visible x-interval                        */
/* -------------------------------------------------------------------------- */

const t = (iso: string): Date => new Date(iso);
const day = (n: number): Date => t(`2026-03-0${n}T00:00:00Z`);

function normalized(series: readonly Series[]) {
  return normalizeSeries(series, { strict: false }).visible;
}

describe("autoscaleValueDomain — fit the visible values (ADR-0014 §3)", () => {
  const model = normalized([
    {
      id: "a",
      label: "A",
      data: [
        { t: day(1), y: 10 },
        { t: day(2), y: 50 },
        { t: day(3), y: 30 },
        { t: day(4), y: 5 },
      ],
    },
  ]);

  it("bounds only the values inside the visible interval", () => {
    // Days 2–3 → values 50 and 30.
    expect(autoscaleValueDomain(model, ms(day(2).getTime(), day(3).getTime()))).toEqual([30, 50]);
  });

  it("includes a datum sitting exactly on the edge", () => {
    // Day 1 exactly at the start edge → value 10 is in.
    expect(autoscaleValueDomain(model, ms(day(1).getTime(), day(2).getTime()))).toEqual([10, 50]);
  });

  it("returns the extentOf empty/all-invalid sentinel when no point is in range", () => {
    expect(autoscaleValueDomain(model, ms(day(5).getTime(), day(6).getTime()))).toEqual([0, 1]);
  });

  it("normalizes a reversed interval rather than reading nothing", () => {
    expect(autoscaleValueDomain(model, ms(day(3).getTime(), day(2).getTime()))).toEqual([30, 50]);
  });

  it("excludes gaps and non-finite values, exactly as valueDomainOf does", () => {
    const withGap = normalized([
      {
        id: "g",
        label: "G",
        data: [
          { t: day(1), y: 10 },
          { t: day(2), y: null }, // a declared gap — not a value
          { t: day(3), y: Number.NaN }, // invalid — not a value
        ],
      },
    ]);
    expect(autoscaleValueDomain(withGap, ms(day(1).getTime(), day(3).getTime()))).toEqual([10, 10]);
  });
});
