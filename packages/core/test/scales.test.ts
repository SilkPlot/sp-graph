import { describe, expect, it } from "vitest";
import { linearScale, timeScale, bandScale, ordinalScale } from "../src/index";

describe("linearScale", () => {
  it("maps a domain value to the range linearly", () => {
    const scale = linearScale({ domain: [0, 10], range: [0, 100] });
    expect(scale(5)).toBeCloseTo(50);
    expect(scale(0)).toBeCloseTo(0);
    expect(scale(10)).toBeCloseTo(100);
  });

  it("nices the domain by default", () => {
    const scale = linearScale({ domain: [0.3, 9.7], range: [0, 100] });
    // d3's nice() extends [0.3, 9.7] to the round bounds [0, 10] for the
    // default tick count.
    expect(scale.domain()).toEqual([0, 10]);
  });

  it("preserves the exact domain when nice is false", () => {
    const scale = linearScale({ domain: [0.3, 9.7], range: [0, 100], nice: false });
    expect(scale.domain()).toEqual([0.3, 9.7]);
  });

  it("does not clamp by default (extrapolates past the domain)", () => {
    const scale = linearScale({ domain: [-5, 15], range: [0, 100], nice: false });
    expect(scale(-100)).toBeCloseTo(-475);
    expect(scale(200)).toBeCloseTo(1025);
  });

  it("clamps outputs to the range when clamp is true", () => {
    const scale = linearScale({ domain: [-5, 15], range: [0, 100], nice: false, clamp: true });
    expect(scale(-100)).toBeCloseTo(0);
    expect(scale(200)).toBeCloseTo(100);
  });

  it("handles an inverted range", () => {
    const scale = linearScale({ domain: [0, 10], range: [100, 0], nice: false });
    expect(scale(5)).toBeCloseTo(50);
    expect(scale(0)).toBeCloseTo(100);
    expect(scale(10)).toBeCloseTo(0);
  });

  it("handles a negative domain", () => {
    const scale = linearScale({ domain: [-50, 50], range: [0, 100], nice: false });
    expect(scale(-50)).toBeCloseTo(0);
    expect(scale(0)).toBeCloseTo(50);
    expect(scale(50)).toBeCloseTo(100);
  });

  it("does not let a mutation of the caller's arrays affect the built scale", () => {
    const domain: [number, number] = [0, 10];
    const range: [number, number] = [0, 100];
    const scale = linearScale({ domain, range, nice: false });
    domain[0] = 999;
    domain[1] = 1000;
    range[0] = 999;
    range[1] = 1000;
    expect(scale.domain()).toEqual([0, 10]);
    expect(scale.range()).toEqual([0, 100]);
    expect(scale(5)).toBeCloseTo(50);
  });
});

describe("timeScale", () => {
  const start = new Date(Date.UTC(2026, 0, 1, 3, 0, 0));
  const end = new Date(Date.UTC(2026, 0, 10, 21, 0, 0));

  it("maps a Date domain to the pixel range", () => {
    const scale = timeScale({ domain: [start, end], range: [0, 100], nice: false });
    expect(scale(start)).toBeCloseTo(0);
    expect(scale(end)).toBeCloseTo(100);
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    expect(scale(mid)).toBeCloseTo(50);
  });

  it("nices the domain to calendar bounds by default", () => {
    const scale = timeScale({ domain: [start, end], range: [0, 100] });
    const [niceStart, niceEnd] = scale.domain();
    // Niced bounds must extend outward past the original, exact domain.
    expect(niceStart!.getTime()).toBeLessThan(start.getTime());
    expect(niceEnd!.getTime()).toBeGreaterThan(end.getTime());

    // `timeScale` is d3's LOCAL-time scale, so `nice()` snaps to local calendar
    // midnight — which is a different UTC instant in every zone. Asserting the
    // absolute instant would only pass where the assertion was written: the
    // original expectation here, "2025-12-31T22:00:00.000Z", is midnight at
    // UTC+2 and failed on CI's UTC runner. Assert the property instead — landing
    // on a local midnight is the contract; the instant it maps to is not.
    for (const bound of [niceStart!, niceEnd!]) {
      expect(bound.getHours()).toBe(0);
      expect(bound.getMinutes()).toBe(0);
      expect(bound.getSeconds()).toBe(0);
      expect(bound.getMilliseconds()).toBe(0);
    }
  });

  it("preserves the exact domain when nice is false", () => {
    const scale = timeScale({ domain: [start, end], range: [0, 100], nice: false });
    const [gotStart, gotEnd] = scale.domain();
    expect(gotStart!.toISOString()).toBe(start.toISOString());
    expect(gotEnd!.toISOString()).toBe(end.toISOString());
  });

  it("does not clamp by default", () => {
    const scale = timeScale({
      domain: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 11))],
      range: [0, 100],
      nice: false,
    });
    expect(scale(new Date(Date.UTC(2025, 11, 20)))).toBeLessThan(0);
    expect(scale(new Date(Date.UTC(2026, 0, 25)))).toBeGreaterThan(100);
  });

  it("clamps outputs to the range when clamp is true", () => {
    const scale = timeScale({
      domain: [new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 11))],
      range: [0, 100],
      nice: false,
      clamp: true,
    });
    expect(scale(new Date(Date.UTC(2025, 11, 20)))).toBeCloseTo(0);
    expect(scale(new Date(Date.UTC(2026, 0, 25)))).toBeCloseTo(100);
  });

  it("does not let a mutation of the caller's arrays affect the built scale", () => {
    const domain: [Date, Date] = [start, end];
    const range: [number, number] = [0, 100];
    const scale = timeScale({ domain, range, nice: false });
    domain[0] = new Date(Date.UTC(2000, 0, 1));
    range[0] = 999;
    expect(scale.domain()[0]!.toISOString()).toBe(start.toISOString());
    expect(scale.range()).toEqual([0, 100]);
  });
});

describe("bandScale", () => {
  it("defaults padding to 0.1 (both inner and outer)", () => {
    const scale = bandScale({ domain: ["a", "b", "c", "d"], range: [0, 100] });
    expect(scale.paddingInner()).toBeCloseTo(0.1);
    expect(scale.paddingOuter()).toBeCloseTo(0.1);
    expect(scale.bandwidth()).toBeCloseTo(21.951219512195124);
    expect(scale.step()).toBeCloseTo(24.390243902439025);
    expect(scale("a")).toBeCloseTo(2.439024390243901);
    expect(scale("b")).toBeCloseTo(26.829268292682926);
  });

  it("applies an explicit padding to both inner and outer", () => {
    const scale = bandScale({ domain: ["a", "b", "c"], range: [0, 120], padding: 0.2 });
    expect(scale.paddingInner()).toBeCloseTo(0.2);
    expect(scale.paddingOuter()).toBeCloseTo(0.2);
  });

  it("defaults align to 0.5", () => {
    const scale = bandScale({ domain: ["a", "b"], range: [0, 100] });
    expect(scale.align()).toBeCloseTo(0.5);
  });

  it("shifts bands toward the range start/end when align is overridden", () => {
    const alignStart = bandScale({
      domain: ["a", "b"],
      range: [0, 100],
      paddingOuter: 0.2,
      align: 0,
    });
    const alignEnd = bandScale({
      domain: ["a", "b"],
      range: [0, 100],
      paddingOuter: 0.2,
      align: 1,
    });
    expect(alignStart("a")).toBeCloseTo(0);
    expect(alignEnd("a")).toBeCloseTo(17.391304347826093);
  });

  it("maps each domain entry to a distinct band with no padding", () => {
    const scale = bandScale({ domain: ["a", "b"], range: [0, 100], padding: 0 });
    expect(scale.bandwidth()).toBeCloseTo(50);
    expect(scale.step()).toBeCloseTo(50);
    expect(scale("a")).toBeCloseTo(0);
    expect(scale("b")).toBeCloseTo(50);
  });

  it("gives a single-entry domain the full range when padding is 0", () => {
    const scale = bandScale({ domain: ["only"], range: [0, 50], padding: 0 });
    expect(scale.bandwidth()).toBeCloseTo(50);
    expect(scale("only")).toBeCloseTo(0);
  });

  describe("padding / paddingInner / paddingOuter interaction", () => {
    // The wrapper always calls scale.padding(...) first (the given `padding`,
    // or 0.1 by default) — d3's padding() sets BOTH paddingInner and
    // paddingOuter. It then conditionally calls paddingInner/paddingOuter,
    // which override only that one dimension. So an explicit paddingInner or
    // paddingOuter wins over `padding` for its own dimension, but the other
    // dimension is left at whatever `padding` produced (the caller's value,
    // or the wrapper's 0.1 default — NOT d3's own bare default of 0).

    it("lets an explicit paddingInner override just the inner padding set by an explicit padding", () => {
      const scale = bandScale({
        domain: ["a", "b", "c"],
        range: [0, 120],
        padding: 0.2,
        paddingInner: 0.5,
      });
      expect(scale.paddingInner()).toBeCloseTo(0.5);
      expect(scale.paddingOuter()).toBeCloseTo(0.2);
    });

    it("lets an explicit paddingOuter override just the outer padding set by an explicit padding", () => {
      const scale = bandScale({
        domain: ["a", "b", "c"],
        range: [0, 120],
        padding: 0.1,
        paddingOuter: 0.3,
      });
      expect(scale.paddingInner()).toBeCloseTo(0.1);
      expect(scale.paddingOuter()).toBeCloseTo(0.3);
    });

    it("falls back to the wrapper's 0.1 default for the untouched dimension when only one of paddingInner/paddingOuter is given without padding", () => {
      // Surprising but consistent: omitting `padding` still runs the
      // wrapper's `else scale.padding(0.1)` branch, so the dimension the
      // caller did NOT override lands on 0.1 rather than d3's bare default
      // of 0.
      const innerOnly = bandScale({
        domain: ["a", "b", "c"],
        range: [0, 120],
        paddingInner: 0.5,
      });
      expect(innerOnly.paddingInner()).toBeCloseTo(0.5);
      expect(innerOnly.paddingOuter()).toBeCloseTo(0.1);

      const outerOnly = bandScale({
        domain: ["a", "b", "c"],
        range: [0, 120],
        paddingOuter: 0.3,
      });
      expect(outerOnly.paddingInner()).toBeCloseTo(0.1);
      expect(outerOnly.paddingOuter()).toBeCloseTo(0.3);
    });

    it("lets explicit paddingInner and paddingOuter together fully override the default padding", () => {
      const scale = bandScale({
        domain: ["a", "b", "c"],
        range: [0, 120],
        paddingInner: 0.5,
        paddingOuter: 0.5,
      });
      expect(scale.paddingInner()).toBeCloseTo(0.5);
      expect(scale.paddingOuter()).toBeCloseTo(0.5);
    });
  });

  it("does not let a mutation of the caller's arrays affect the built scale", () => {
    const domain: string[] = ["a", "b", "c"];
    const range: [number, number] = [0, 100];
    const scale = bandScale({ domain, range });
    domain[0] = "z";
    range[0] = 999;
    expect(scale.domain()).toEqual(["a", "b", "c"]);
    expect(scale.range()).toEqual([0, 100]);
  });
});

describe("ordinalScale", () => {
  it("maps categorical domain entries to arbitrary range values", () => {
    const scale = ordinalScale({
      domain: ["low", "mid", "high"],
      range: ["blue", "orange", "red"],
    });
    expect(scale("low")).toBe("blue");
    expect(scale("mid")).toBe("orange");
    expect(scale("high")).toBe("red");
  });

  it("recycles the range when the domain is longer than the range", () => {
    const scale = ordinalScale({ domain: ["x", "y", "z"], range: ["red", "green"] });
    expect(scale("x")).toBe("red");
    expect(scale("y")).toBe("green");
    expect(scale("z")).toBe("red");
  });

  it("implicitly extends the domain for unknown inputs, continuing to cycle the range", () => {
    // d3's ordinal scale default `unknown` behavior is "implicit": a value
    // outside the given domain is appended to the domain and assigned the
    // next range slot, rather than raising or returning undefined.
    const scale = ordinalScale({ domain: ["x", "y", "z"], range: ["red", "green"] });
    expect(scale("w")).toBe("green");
    expect(scale.domain()).toEqual(["x", "y", "z", "w"]);
  });

  it("does not let a mutation of the caller's arrays affect the built scale", () => {
    const domain: string[] = ["a", "b"];
    const range: string[] = ["red", "blue"];
    const scale = ordinalScale({ domain, range });
    domain[0] = "z";
    range[0] = "green";
    expect(scale.domain()).toEqual(["a", "b"]);
    expect(scale.range()).toEqual(["red", "blue"]);
    expect(scale("a")).toBe("red");
  });
});
