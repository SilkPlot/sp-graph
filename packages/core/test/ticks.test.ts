import { describe, expect, it } from "vitest";
import {
  computeTicks,
  computeBandTicks,
  numberFormat,
  timeLabelFormat,
  linearScale,
  timeScale,
  bandScale,
} from "../src/index";

describe("computeTicks — linear scale", () => {
  it("returns ticks whose position matches scale(value) and carries a non-empty label", () => {
    const scale = linearScale({ domain: [0, 100], range: [0, 400] });
    const ticks = computeTicks(scale);

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(typeof tick.value).toBe("number");
      expect(tick.position).toBeCloseTo(scale(tick.value as number));
      expect(tick.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps tick positions within the range when the domain already sits on nice bounds", () => {
    // domain [0, 100] is already "nice", so nice() is a no-op and every tick
    // value stays inside the original domain — positions must stay in-range.
    const scale = linearScale({ domain: [0, 100], range: [0, 400] });
    const ticks = computeTicks(scale);
    for (const tick of ticks) {
      expect(tick.position).toBeGreaterThanOrEqual(0);
      expect(tick.position).toBeLessThanOrEqual(400);
    }
  });
});

describe("computeTicks — time scale", () => {
  it("returns Date-valued ticks whose position matches scale(value) and carries a label", () => {
    const scale = timeScale({
      domain: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31))],
      range: [0, 800],
    });
    const ticks = computeTicks(scale);

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.value).toBeInstanceOf(Date);
      expect(tick.position).toBeCloseTo(scale(tick.value as Date));
      expect(tick.label.length).toBeGreaterThan(0);
    }
  });
});

describe("computeTicks — scale-kind detection", () => {
  it("classifies a linear scale as non-time even with a degenerate [0, 0] domain", () => {
    const scale = linearScale({ domain: [0, 0], range: [0, 400] });
    const ticks = computeTicks(scale);

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.value).not.toBeInstanceOf(Date);
      expect(typeof tick.value).toBe("number");
    }
  });

  it("classifies a time scale as time even when domain start === end (degenerate)", () => {
    // isTimeScale probes `scale.ticks(1)[0] instanceof Date`. Empirically
    // (d3-scale 4.x), ticks(1) on a zero-width time domain still returns a
    // single Date rather than []; if a future d3-scale version changed that,
    // the probe would read `undefined instanceof Date` (false) and silently
    // misclassify the scale as linear, producing numeric-formatted garbage
    // labels for a time axis. This test guards that contract.
    const d = new Date(Date.UTC(2026, 5, 15));
    const scale = timeScale({ domain: [d, d], range: [0, 800] });
    const ticks = computeTicks(scale);

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.value).toBeInstanceOf(Date);
    }
  });
});

describe("computeTicks — count option", () => {
  it("floors count 0 and count 1 to the same minimum of 2", () => {
    const scale = linearScale({ domain: [0, 100], range: [0, 400] });
    const zero = computeTicks(scale, { count: 0 });
    const one = computeTicks(scale, { count: 1 });

    expect(zero.length).toBeGreaterThanOrEqual(2);
    expect(one.length).toBeGreaterThanOrEqual(2);
    // Both map through Math.max(2, count), so they hit the same d3 ticks(2) call.
    expect(zero.length).toBe(one.length);
  });

  it("yields more ticks for a larger requested count (d3 treats count as a hint, not exact)", () => {
    const scale = linearScale({ domain: [0, 100], range: [0, 400] });
    const small = computeTicks(scale, { count: 2 });
    const large = computeTicks(scale, { count: 20 });

    expect(large.length).toBeGreaterThan(small.length);
  });
});

describe("computeTicks — pixelsPerTick derivation", () => {
  it("derives roughly floor(extent / 80) ticks when count is omitted", () => {
    // extent 800 / 80 = 10 requested; d3 does not guarantee an exact count,
    // so assert a range rather than pinning the exact length.
    const scale = linearScale({ domain: [0, 1000], range: [0, 800] });
    const ticks = computeTicks(scale);

    expect(ticks.length).toBeGreaterThanOrEqual(8);
    expect(ticks.length).toBeLessThanOrEqual(13);
  });

  it("clamps the derived count to the minimum of 2 for a small range", () => {
    const scale = linearScale({ domain: [0, 1000], range: [0, 80] });
    const ticks = computeTicks(scale);

    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it("clamps to the same minimum when floor(extent / 80) would be 0", () => {
    // extent 40 -> floor(40 / 80) = 0 -> clamped to 2, identical hint to extent 80.
    const wide = computeTicks(linearScale({ domain: [0, 1000], range: [0, 800] }));
    const narrow = computeTicks(linearScale({ domain: [0, 1000], range: [0, 40] }));

    expect(narrow.length).toBeGreaterThanOrEqual(2);
    expect(narrow.length).toBeLessThan(wide.length);
  });

  it("respects an explicit pixelsPerTick override", () => {
    const scale = linearScale({ domain: [0, 1000], range: [0, 800] });
    const coarse = computeTicks(scale, { pixelsPerTick: 400 }); // floor(800 / 400) = 2
    const fine = computeTicks(scale, { pixelsPerTick: 40 }); // floor(800 / 40) = 20

    expect(fine.length).toBeGreaterThan(coarse.length);
  });
});

describe("computeTicks — custom format override", () => {
  it("uses a custom formatter for a linear scale instead of the default", () => {
    const scale = linearScale({ domain: [0, 100], range: [0, 400] });
    const ticks = computeTicks(scale, { format: (v: number) => `n${v}` });

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.label.startsWith("n")).toBe(true);
    }
  });

  it("uses a custom formatter for a time scale instead of the default", () => {
    const scale = timeScale({
      domain: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 11, 31))],
      range: [0, 800],
    });
    const ticks = computeTicks(scale, { format: () => "X" });

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      expect(tick.label).toBe("X");
    }
  });
});

describe("computeTicks — formatter typing (compile-time contract)", () => {
  // These tests earn their keep at `tsc` time as much as at runtime: the
  // expect-error directive below FAILS the typecheck if the rejection stops
  // happening, and the inline-lambda cases fail to compile if `v` stops inferring.
  const D0 = new Date(Date.UTC(2026, 0, 1));
  const D1 = new Date(Date.UTC(2026, 11, 31));

  it("infers `number` for a linear scale's inline formatter (the old `never` rejected this)", () => {
    const linear = linearScale({ domain: [0, 100], range: [0, 400] });
    const ticks = computeTicks(linear, { format: (v) => v.toFixed(2) });
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(tick.label).toContain(".");
  });

  it("infers `Date` for a time scale's inline formatter", () => {
    const time = timeScale({ domain: [D0, D1], range: [0, 800] });
    // `v` must carry Date methods; the label content is a 4-digit year. The
    // exact year is not pinned — a tick at local midnight can read a UTC year
    // one off — but calling `getUTCFullYear` at all is the proof `v` is a Date.
    const ticks = computeTicks(time, { format: (v) => String(v.getUTCFullYear()) });
    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) expect(tick.label).toMatch(/^\d{4}$/);
  });

  it("rejects a Date formatter on a linear scale — the direction the old bug travelled", () => {
    const linear = linearScale({ domain: [0, 100], range: [0, 400] });
    // Purely a COMPILE-TIME assertion: this closure is never invoked, because at
    // runtime `v` is a number and `getUTCFullYear` would throw. What matters is
    // that `tsc` rejects the annotation — exactly what the old `(value: never)`
    // signature waved through, producing garbage numeric-axis labels. The
    // ts-expect-error line fails the typecheck if this ever compiles again.
    const rejected = () =>
      // @ts-expect-error a Date formatter is a category error on a linear scale
      computeTicks(linear, { format: (v: Date) => String(v.getUTCFullYear()) });
    expect(typeof rejected).toBe("function");

    // The mirror direction (a numeric formatter on a TIME scale) is NOT
    // statically rejectable and is deliberately not asserted: d3's
    // `ScaleTime<number, number>` is structurally assignable to
    // `ScaleLinear<number, number>`, so a time scale always also matches the
    // linear overload. The runtime `isTimeScale` probe still routes it
    // correctly; the type system simply cannot forbid the annotation. The
    // load-bearing rejection — the one that had a live bug — is enforced above.
  });
});

describe("computeBandTicks — labels and formatter", () => {
  const band = bandScale({ domain: ["alpha", "beta", "gamma"], range: [0, 300] });

  it("uses each category verbatim as its label when no formatter is given", () => {
    const ticks = computeBandTicks(band);
    expect(ticks.map((t) => t.label)).toEqual(["alpha", "beta", "gamma"]);
    expect(ticks.map((t) => t.value)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("applies a string formatter to the category label (band takes a formatter, not none)", () => {
    const ticks = computeBandTicks(band, { format: (v) => v.toUpperCase() });
    expect(ticks.map((t) => t.label)).toEqual(["ALPHA", "BETA", "GAMMA"]);
    // The underlying value stays the raw category — only the label is formatted.
    expect(ticks.map((t) => t.value)).toEqual(["alpha", "beta", "gamma"]);
    // Vacuous-pass guard: the formatter must actually have changed the labels.
    expect(computeBandTicks(band).map((t) => t.label)).not.toEqual(
      ticks.map((t) => t.label),
    );
  });
});

describe("numberFormat", () => {
  it("is a thin passthrough to d3-format specifiers", () => {
    expect(numberFormat(".1f")(1.23456)).toBe("1.2");
    expect(numberFormat(",.2f")(1234.5)).toBe("1,234.50");
  });
});

describe("timeLabelFormat", () => {
  it("is a thin passthrough to d3-time-format specifiers", () => {
    // Noon UTC on a mid-month day so the local-time formatting d3-time-format
    // performs can't shift the year or month across a boundary regardless of
    // the machine's timezone.
    const midMonthNoonUtc = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
    expect(timeLabelFormat("%Y")(midMonthNoonUtc)).toBe("2026");
    expect(timeLabelFormat("%b")(midMonthNoonUtc)).toBe("Jul");
  });
});
