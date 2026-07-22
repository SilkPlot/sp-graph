import { LineChart, seriesColorToken, type TimePoint } from "@silkplot/charts";
import type { TimeInterval } from "@silkplot/core";
import { RangeControl } from "@silkplot/solid";
import { createSignal, type Component } from "solid-js";

const START = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const sessions: TimePoint[] = Array.from({ length: 120 }, (_, i) => ({
  t: new Date(START + i * DAY),
  y: Math.round(800 + 300 * Math.sin(i / 9) + 90 * Math.sin(i / 2.3) + i * 2),
}));

const FULL: TimeInterval = {
  start: new Date(START),
  end: new Date(START + 119 * DAY),
};

const fmt = (ms: number): string =>
  new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric" });

// One signal is the whole wiring: the chart and the range control read the
// same visible domain and commit through the same setter, so there is no
// second authority to drift. A brush on the chart moves the control's band;
// dragging the control's handles moves the chart.
const Example: Component = () => {
  const [visible, setVisible] = createSignal<TimeInterval>({
    start: new Date(START + 60 * DAY),
    end: new Date(START + 90 * DAY),
  });

  return (
    <div>
      <LineChart
        data={sessions}
        stroke={seriesColorToken(2)}
        height={240}
        brushSelect
        wheelZoom
        minSpan={5 * DAY}
        visibleDomain={visible()}
        onVisibleDomainChange={setVisible}
        title="Daily sessions, four months"
        summary="Daily sessions over four months; the visible window is chosen with the range control below."
        table={{ columns: ["Day", "Sessions"] }}
        pointLabel={(d) => `${fmt(d.t.getTime())}, ${d.y} sessions`}
      />
      <fieldset class="viewport-toolbar">
        <legend class="viewport-toolbar__legend">Range controls</legend>
        {/* Controlled recovery needs no command API: the window is our own
            signal, so reset is just setting it back to the full extent. */}
        <button type="button" class="sp-focusable" onClick={() => setVisible(FULL)}>Reset range</button>
      </fieldset>
      <RangeControl
        fullExtent={FULL}
        visibleDomain={visible()}
        onVisibleDomainChange={setVisible}
        minSpan={5 * DAY}
        width={320}
        label="Visible session range"
        valueText={(ms, which) =>
          which === "window"
            ? `${fmt(visible().start.getTime())} to ${fmt(visible().end.getTime())}`
            : fmt(ms)
        }
      />
    </div>
  );
};

export default Example;
