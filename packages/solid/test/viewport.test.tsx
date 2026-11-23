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
import { createRoot, createSignal, flush } from "solid-js";
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

/** Setup runs under an owner; commands run outside it just as event handlers do. */
function withFixture<T>(setup: () => T, run: (fixture: T) => void): void {
  const { fixture, dispose } = createRoot((dispose) => ({ fixture: setup(), dispose }));
  try {
    run(fixture);
  } finally {
    dispose();
  }
}

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
    withFixture(() => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 2 * DAY),
      });
      return { vp };
    }, ({ vp }) => {
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 2 * DAY));
      // The public read is Date, the same instants.
      expect(vp.visibleDomain().start.getTime()).toBe(T0 + 1 * DAY);

      vp.pan(1 * DAY);
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 3 * DAY));
      vp.reset();
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 2 * DAY));
    });
  });

  it("uses the latest default on reset without moving a navigated viewport prematurely", () => {
    withFixture(() => {
      const [defaultDomain, setDefaultDomain] = createSignal(date(T0 + DAY, T0 + 2 * DAY));
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 5 * DAY),
        defaultVisibleDomain: defaultDomain,
      });
      return { vp, setDefaultDomain };
    }, ({ vp, setDefaultDomain }) => {
      vp.pan(DAY);
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 3 * DAY));

      setDefaultDomain(date(T0 + 3 * DAY, T0 + 4 * DAY));
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 3 * DAY));

      vp.reset();
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 3 * DAY, T0 + 4 * DAY));
    });
  });

  it("seeds from the full extent when no default is declared", () => {
    withFixture(() => {
      const vp = createViewport({ fullExtent: () => ms(T0, T0 + 4 * DAY) });
      return { vp };
    }, ({ vp }) => {
      expect(vp.visibleMsDomain()).toEqual(ms(T0, T0 + 4 * DAY));
    });
  });

  it("clamps a pan at the edge and labels the cause", () => {
    withFixture(() => {
      const onChange = vi.fn<(d: TimeInterval, c: ViewportCause) => void>();
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 2 * DAY, T0 + 3 * DAY),
        onVisibleDomainChange: onChange,
      });
      return { vp, onChange };
    }, ({ vp, onChange }) => {
      vp.pan(100 * DAY); // way past the right edge
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 3 * DAY, T0 + 4 * DAY));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0]?.[1]).toBe("pan");
    });
  });

  it("floors a zoom-in at min-span", () => {
    withFixture(() => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        minSpan: () => DAY, // never zoom below one day
      });
      return { vp };
    }, ({ vp }) => {
      // Zoom in hard about the centre; the span cannot drop below one day.
      vp.zoomAround(0.0001, T0 + 2 * DAY);
      flush();
      expect(vp.visibleMsDomain().end - vp.visibleMsDomain().start).toBe(DAY);
    });
  });

  it("normalises a right-to-left brush rather than storing a reversed interval", () => {
    withFixture(() => {
      const vp = createViewport({ fullExtent: () => ms(T0, T0 + 4 * DAY) });
      return { vp };
    }, ({ vp }) => {
      vp.brush(ms(T0 + 3 * DAY, T0 + 1 * DAY)); // dragged leftward
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
    });
  });

  it("zoomIn halves and zoomOut doubles the visible span, about its centre", () => {
    withFixture(() => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 8 * DAY),
        defaultVisibleDomain: () => date(T0 + 2 * DAY, T0 + 6 * DAY), // span 4d, centre T0+4d
      });
      return { vp };
    }, ({ vp }) => {
      vp.zoomIn();
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 3 * DAY, T0 + 5 * DAY)); // 2d about T0+4d
      vp.zoomOut();
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 6 * DAY)); // back to 4d
    });
  });

  it("fires nothing when a command resolves to the domain already shown (echo guard)", () => {
    withFixture(() => {
      const onChange = vi.fn();
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        onVisibleDomainChange: onChange,
      });
      return { vp, onChange };
    }, ({ vp, onChange }) => {
      vp.pan(0); // no movement
      flush();
      vp.setVisibleDomain(ms(T0, T0 + 4 * DAY), "range-control"); // already the whole extent
      flush();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it("falls back to the whole bound when a set request is disjoint from the extent", () => {
    withFixture(() => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 2 * DAY),
      });
      return { vp };
    }, ({ vp }) => {
      // A range control driven to a window with no instant inside the extent.
      vp.setVisibleDomain(ms(T0 + 100 * DAY, T0 + 104 * DAY), "range-control");
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0, T0 + 4 * DAY));
    });
  });

  it("snapshots [0,1] on autoscale when no series is supplied", () => {
    withFixture(() => {
      const vp = createViewport({ fullExtent: () => ms(T0, T0 + 4 * DAY) });
      return { vp };
    }, ({ vp }) => {
      vp.autoscale();
      flush();
      // extentOf over no points is the [0,1] sentinel — the same one valueDomainOf uses.
      expect(vp.autoscaledValueDomain()).toEqual([0, 1]);
    });
  });
});

describe("createViewport — controlled", () => {
  it("shows the controlled domain and clamps it into the bound for display", () => {
    withFixture(() => {
      const [vd] = createSignal<TimeInterval | undefined>(date(T0 - 50 * DAY, T0 + 2 * DAY));
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        visibleDomain: vd,
      });
      return { vp };
    }, ({ vp }) => {
      // The controlled start hangs off the left; the display cannot widen past the
      // extent, so it is clamped to the bound's start.
      expect(vp.visibleMsDomain()).toEqual(ms(T0, T0 + 2 * DAY));
    });
  });

  it("does not loop when the caller feeds the emitted domain back into visibleDomain", () => {
    withFixture(() => {
      const [vd, setVd] = createSignal<TimeInterval | undefined>(date(T0 + 1 * DAY, T0 + 2 * DAY));
      const onChange = vi.fn((d: TimeInterval) => setVd(d)); // the classic feedback wire
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        visibleDomain: vd,
        onVisibleDomainChange: onChange,
      });
      return { vp, onChange };
    }, ({ vp, onChange }) => {
      vp.pan(1 * DAY);
      flush();
      // Exactly one callback: the command fired it; feeding it back changed the
      // controlled prop but re-fired nothing.
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 2 * DAY, T0 + 3 * DAY));
    });
  });
});

describe("createViewport — bounded by a dashboard's effective domain (ADR-0014 §3)", () => {
  it("uses the effective domain as the outer bound, and reset lands on it", () => {
    withFixture(() => {
      // The dashboard has narrowed the page to days 1–3; the member cannot
      // navigate outside that, and a reset returns to it, never to the raw extent.
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 10 * DAY),
        effectiveBound: () => ms(T0 + 1 * DAY, T0 + 3 * DAY),
      });
      return { vp };
    }, ({ vp }) => {
      // Seeded to the effective bound, not the raw extent.
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
      // A pan toward day 8 is clamped to the effective bound's edge.
      vp.pan(100 * DAY);
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
      // Zoom in, then reset — back to the effective bound.
      vp.zoomIn();
      flush();
      expect(vp.visibleMsDomain().end - vp.visibleMsDomain().start).toBe(1 * DAY);
      vp.reset();
      flush();
      expect(vp.visibleMsDomain()).toEqual(ms(T0 + 1 * DAY, T0 + 3 * DAY));
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
    withFixture(() => {
      // A signal that stands in for a pixel-size change: the holder has no pixel
      // input at all, so changing it must not move the interval.
      const [, setPixelWidth] = createSignal(300);
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 3 * DAY),
      });
      return { vp, setPixelWidth };
    }, ({ vp, setPixelWidth }) => {
      const before = vp.visibleMsDomain();
      setPixelWidth(900); // "resized"
      flush();
      expect(vp.visibleMsDomain()).toEqual(before);
    });
  });

  it("feeds one domain to a scale, which agrees with the viewport before and after a pan", () => {
    withFixture(() => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 4 * DAY),
        defaultVisibleDomain: () => date(T0 + 1 * DAY, T0 + 3 * DAY),
      });
      return { vp };
    }, ({ vp }) => {
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
      flush();
      s = scaleOf();
      expect(s(new Date(vp.visibleMsDomain().start))).toBeCloseTo(0);
      expect(s(new Date(vp.visibleMsDomain().end))).toBeCloseTo(500);
    });
  });
});

describe("createViewport — autoscale (ADR-0014 §3)", () => {
  it("recomputes the value extent over the visible window, live", () => {
    withFixture(() => {
      const [vd, setVd] = createSignal<TimeInterval | undefined>(date(T0 + 1 * DAY, T0 + 2 * DAY));
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 3 * DAY),
        visibleDomain: vd,
        series: visibleSeries,
      });
      return { vp, setVd };
    }, ({ vp, setVd }) => {
      // Days 1–2 → values 50, 30.
      expect(vp.visibleValueDomain()).toEqual([30, 50]);
      // Move the window to days 2–3 → values 30, 5.
      setVd(date(T0 + 2 * DAY, T0 + 3 * DAY));
      flush();
      expect(vp.visibleValueDomain()).toEqual([5, 30]);
    });
  });

  it("snapshots the visible value extent on the autoscale command, pinned against later pans", () => {
    withFixture(() => {
      const vp = createViewport({
        fullExtent: () => ms(T0, T0 + 3 * DAY),
        defaultVisibleDomain: () => date(T0 + 0 * DAY, T0 + 1 * DAY),
        series: visibleSeries,
      });
      return { vp };
    }, ({ vp }) => {
      expect(vp.autoscaledValueDomain()).toBeUndefined();
      vp.autoscale(); // fit to days 0–1 → values 10, 50
      flush();
      expect(vp.autoscaledValueDomain()).toEqual([10, 50]);
      // A later pan changes the LIVE extent but not the pinned snapshot.
      vp.pan(2 * DAY);
      flush();
      expect(vp.autoscaledValueDomain()).toEqual([10, 50]);
      expect(vp.visibleValueDomain()).not.toEqual([10, 50]);
    });
  });
});
