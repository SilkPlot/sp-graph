/**
 * createViewport — the reactive holder's own contract (ADR-0014 §3/§4, ADR-0017).
 *
 * The pure interval arithmetic is proved in `@silkplot/core`'s `viewport.test.ts`.
 * What is left here is the reactive layer: controlled vs uncontrolled, the single
 * `Date`↔ms boundary, the cause-labelled callback and its loop-freedom, the
 * data-change reconciliation effect, and the renderer-independence that lets the
 * interval survive a resize. One `visibleMsDomain` feeds every scale consumer, so
 * a no-drift proof lives here too: a scale built from it agrees before and after a
 * navigation.
 */
import { describe, expect, it, vi } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { createViewport } from "../src/index";
import {
  normalizeSeries,
  timeScale,
  type MsInterval,
  type Series,
  type TimeInterval,
  type ViewportCause,
} from "@silkplot/core";

const T0 = Date.UTC(2026, 2, 1);
const DAY = 24 * 60 * 60 * 1000;
const ms = (a: number, b: number): MsInterval => ({ start: a, end: b });
const date = (a: number, b: number): TimeInterval => ({ start: new Date(a), end: new Date(b) });
/** One microtask turn, so a deferred `createEffect` registers and then re-runs. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const SERIES: readonly Series[] = [
  {
    id: "s",
    label: "S",
    data: [
      { t: new Date(T0 + 0 * DAY), y: 10 },
      { t: new Date(T0 + 1 * DAY), y: 50 },
      { t: new Date(T0 + 2 * DAY), y: 30 },
      { t: new Date(T0 + 3 * DAY), y: 5 },
    ],
  },
];
const visibleSeries = () => normalizeSeries(SERIES, { strict: false }).visible;

describe("createViewport — uncontrolled navigation", () => {
  it("seeds from the declared default, and reset returns to it", () => {
    createRoot((dispose) => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 2 * DAY),
      });
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 2 * DAY));
      // The public read is Date, the same instants.
      expect(vp.visibleDomain().start.getTime()).toBe(T0 + 1 * DAY);

      vp.pan(1 * DAY);
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 3 * DAY));
      vp.reset();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 2 * DAY));
      dispose();
    });
  });

  it("seeds from the full extent when no default is declared", () => {
    createRoot((dispose) => {
      const vp = createViewport({ fullExtent: () => ms(T0, T0 + 4 * DAY) });
      expect(vp.visibleMsDomain()).toEqual(ms(T0, T0 + 4 * DAY));
      dispose();
    });
  });

  it("clamps a pan at the edge and labels the cause", () => {
    createRoot((dispose) => {
      const onChange = vi.fn<(d: TimeInterval, c: ViewportCause) => void>();
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 2 * DAY, T0 + 3 * DAY),
        onVisibleDomainChange: onChange,
      });
      vp.pan(100 * DAY); // way past the right edge
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 3 * DAY, T0 + 4 * DAY));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0]?.[1]).toBe("pan");
      dispose();
    });
  });

  it("floors a zoom-in at min-span", () => {
    createRoot((dispose) => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        minSpan: () => DAY, // never zoom below one day
      });
      // Zoom in hard about the centre; the span cannot drop below one day.
      vp.zoomAround(0.0001, T0 + 2 * DAY);
      expect(vp.visibleMsDomain().end - vp.visibleMsDomain().start).toBe(DAY);
      dispose();
    });
  });

  it("normalises a right-to-left brush rather than storing a reversed interval", () => {
    createRoot((dispose) => {
      const vp = createViewport({ fullExtent: () => ms(T0, T0 + 4 * DAY) });
      vp.brush(ms(T0 + 3 * DAY, T0 + 1 * DAY)); // dragged leftward
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
      dispose();
    });
  });

  it("zoomIn halves and zoomOut doubles the visible span, about its centre", () => {
    createRoot((dispose) => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 8 * DAY),
        defaultVisibleDomain: () => date(T0 + 2 * DAY, T0 + 6 * DAY), // span 4d, centre T0+4d
      });
      vp.zoomIn();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 3 * DAY, T0 + 5 * DAY)); // 2d about T0+4d
      vp.zoomOut();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 6 * DAY)); // back to 4d
      dispose();
    });
  });

  it("fires nothing when a command resolves to the domain already shown (echo guard)", () => {
    createRoot((dispose) => {
      const onChange = vi.fn();
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        onVisibleDomainChange: onChange,
      });
      vp.pan(0); // no movement
      vp.setVisibleDomain(ms(T0, T0 + 4 * DAY), "range-control"); // already the whole extent
      expect(onChange).not.toHaveBeenCalled();
      dispose();
    });
  });

  it("falls back to the whole bound when a set request is disjoint from the extent", () => {
    createRoot((dispose) => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 2 * DAY),
      });
      // A range control driven to a window with no instant inside the extent.
      vp.setVisibleDomain(ms(T0 + 100 * DAY, T0 + 104 * DAY), "range-control");
      expect(vp.visibleMsDomain()).toEqual(ms(T0, T0 + 4 * DAY));
      dispose();
    });
  });

  it("snapshots [0,1] on autoscale when no series is supplied", () => {
    createRoot((dispose) => {
      const vp = createViewport({ fullExtent: () => ms(T0, T0 + 4 * DAY) });
      vp.autoscale();
      // extentOf over no points is the [0,1] sentinel — the same one valueDomainOf uses.
      expect(vp.autoscaledValueDomain()).toEqual([0, 1]);
      dispose();
    });
  });
});

describe("createViewport — controlled", () => {
  it("shows the controlled domain and clamps it into the bound for display", () => {
    createRoot((dispose) => {
      const [vd] = createSignal<TimeInterval | undefined>(date(T0 - 50 * DAY, T0 + 2 * DAY));
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        visibleDomain: vd,
      });
      // The controlled start hangs off the left; the display cannot widen past the
      // extent, so it is clamped to the bound's start.
      expect(vp.visibleMsDomain()).toEqual(ms(T0, T0 + 2 * DAY));
      dispose();
    });
  });

  it("does not loop when the caller feeds the emitted domain back into visibleDomain", () => {
    createRoot((dispose) => {
      const [vd, setVd] = createSignal<TimeInterval | undefined>(date(T0 + 1 * DAY, T0 + 2 * DAY));
      const onChange = vi.fn((d: TimeInterval) => setVd(d)); // the classic feedback wire
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        visibleDomain: vd,
        onVisibleDomainChange: onChange,
      });
      vp.pan(1 * DAY);
      // Exactly one callback: the command fired it; feeding it back changed the
      // controlled prop but re-fired nothing.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 3 * DAY));
      dispose();
    });
  });
});

describe("createViewport — bounded by a dashboard's effective domain (ADR-0014 §3)", () => {
  it("uses the effective domain as the outer bound, and reset lands on it", () => {
    createRoot((dispose) => {
      // The dashboard has narrowed the page to days 1–3; the member cannot
      // navigate outside that, and a reset returns to it, never to the raw extent.
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 10 * DAY),
        effectiveBound: () => ms(T0 + 1 * DAY, T0 + 3 * DAY),
      });
      // Seeded to the effective bound, not the raw extent.
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
      // A pan toward day 8 is clamped to the effective bound's edge.
      vp.pan(100 * DAY);
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
      // Zoom in, then reset — back to the effective bound.
      vp.zoomIn();
      expect(vp.visibleMsDomain().end - vp.visibleMsDomain().start).toBe(1 * DAY);
      vp.reset();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
      dispose();
    });
  });
});

describe("createViewport — data-change reconciliation (ADR-0014 §4)", () => {
  it("keeps the interval and fires nothing on progressive growth", async () => {
    await createRoot(async (dispose) => {
      const onChange = vi.fn();
      const [extent, setExtent] = createSignal<MsInterval>(ms(T0, T0 + 4 * DAY));
      const vp = createViewport({
        fullExtent: extent,
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 2 * DAY),
        onVisibleDomainChange: onChange,
      });
      await tick();
      setExtent(ms(T0, T0 + 40 * DAY)); // grew to the right
      await tick();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 2 * DAY)); // unchanged
      expect(onChange).not.toHaveBeenCalled(); // not auto-scrolled
      dispose();
    });
  });

  it("trims the interval into a shrunk extent, firing cause replacement", async () => {
    await createRoot(async (dispose) => {
      const onChange = vi.fn<(d: TimeInterval, c: ViewportCause) => void>();
      const [extent, setExtent] = createSignal<MsInterval>(ms(T0, T0 + 4 * DAY));
      const vp = createViewport({
        fullExtent: extent,
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 4 * DAY),
        onVisibleDomainChange: onChange,
      });
      await tick();
      setExtent(ms(T0, T0 + 2 * DAY)); // shrank under the window's right half
      await tick();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 2 * DAY));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0]?.[1]).toBe("replacement");
      dispose();
    });
  });

  it("does not auto-reconcile a CONTROLLED viewport — its caller owns the interval", async () => {
    await createRoot(async (dispose) => {
      const onChange = vi.fn();
      const [extent, setExtent] = createSignal<MsInterval>(ms(T0, T0 + 4 * DAY));
      const [vd] = createSignal<TimeInterval | undefined>(date(T0 + 1 * DAY, T0 + 3 * DAY));
      const vp = createViewport({
        fullExtent: extent,
        visibleDomain: vd,
        onVisibleDomainChange: onChange,
      });
      await tick();
      setExtent(ms(T0, T0 + 2 * DAY)); // extent shrank under the controlled window
      await tick();
      // No reconciliation callback: the controlled caller owns the interval. The
      // DISPLAY still clamps it into the new extent so nothing widens past it.
      expect(onChange).not.toHaveBeenCalled();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 2 * DAY));
      dispose();
    });
  });

  it("resets when the window is left disjoint from the new extent", async () => {
    await createRoot(async (dispose) => {
      const [extent, setExtent] = createSignal<MsInterval>(ms(T0, T0 + 4 * DAY));
      const vp = createViewport({
        fullExtent: extent,
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 2 * DAY),
      });
      await tick();
      // A source change to a wholly later window: nothing overlaps the old one.
      setExtent(ms(T0 + 100 * DAY, T0 + 104 * DAY));
      await tick();
      // Reset lands on the declared default, clamped into the new extent — which
      // is disjoint from it, so it falls back to the new extent.
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 100 * DAY, T0 + 104 * DAY));
      dispose();
    });
  });
});

describe("createViewport — renderer independence and no drift", () => {
  it("leaves the interval identical across an unrelated re-render (a resize touches no state)", () => {
    createRoot((dispose) => {
      // A signal that stands in for a pixel-size change: the holder has no pixel
      // input at all, so changing it must not move the interval.
      const [, setPixelWidth] = createSignal(300);
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 3 * DAY),
      });
      const before = vp.visibleMsDomain();
      setPixelWidth(900); // "resized"
      expect(vp.visibleMsDomain()).toEqual(before);
      dispose();
    });
  });

  it("feeds one domain to a scale, which agrees with the viewport before and after a pan", () => {
    createRoot((dispose) => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 3 * DAY),
      });
      const range: [number, number] = [0, 500];
      const scaleOf = () => {
        const v = vp.visibleMsDomain();
        // `nice: false` is not incidental: a viewport scale that niced would
        // widen the domain past the selected interval and show data outside it.
        return timeScale({ domain: [new Date(v.start), new Date(v.end)], range, nice: false });
      };

      // Every axis tick, gridline, and mark is placed by a scale built from this
      // one domain — so proving the scale's endpoints ARE the viewport's, before
      // and after a navigation, proves none of them can drift from it.
      let s = scaleOf();
      expect(s(new Date(vp.visibleMsDomain().start))).toBeCloseTo(0);
      expect(s(new Date(vp.visibleMsDomain().end))).toBeCloseTo(500);

      vp.pan(0.5 * DAY);
      s = scaleOf();
      expect(s(new Date(vp.visibleMsDomain().start))).toBeCloseTo(0);
      expect(s(new Date(vp.visibleMsDomain().end))).toBeCloseTo(500);
      dispose();
    });
  });
});

describe("createViewport — autoscale (ADR-0014 §3)", () => {
  it("recomputes the value extent over the visible window, live", () => {
    createRoot((dispose) => {
      const [vd, setVd] = createSignal<TimeInterval | undefined>(date(T0 + 1 * DAY, T0 + 2 * DAY));
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 3 * DAY),
        visibleDomain: vd,
        series: visibleSeries,
      });
      // Days 1–2 → values 50, 30.
      expect(vp.visibleValueDomain()).toEqual([30, 50]);
      // Move the window to days 2–3 → values 30, 5.
      setVd(date(T0 + 2 * DAY, T0 + 3 * DAY));
      expect(vp.visibleValueDomain()).toEqual([5, 30]);
      dispose();
    });
  });

  it("snapshots the visible value extent on the autoscale command, pinned against later pans", () => {
    createRoot((dispose) => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 3 * DAY),
        defaultVisibleDomain: () => date(T0 + 0 * DAY, T0 + 1 * DAY),
        series: visibleSeries,
      });
      expect(vp.autoscaledValueDomain()).toBeUndefined();
      vp.autoscale(); // fit to days 0–1 → values 10, 50
      expect(vp.autoscaledValueDomain()).toEqual([10, 50]);
      // A later pan changes the LIVE extent but not the pinned snapshot.
      vp.pan(2 * DAY);
      expect(vp.autoscaledValueDomain()).toEqual([10, 50]);
      expect(vp.visibleValueDomain()).not.toEqual([10, 50]);
      dispose();
    });
  });
});
