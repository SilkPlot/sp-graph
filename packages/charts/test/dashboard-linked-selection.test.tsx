/**
 * Dashboard-linked drag selection (ADR-0020).
 *
 * A drag on one chart inside a dashboard sets the shared dynamic selection, and
 * every UNSECTIONED member follows it while a section with its own scope stays
 * isolated (ADR-0007 precedence: section > dynamic > global). These drive a real
 * pointer drag across one chart and read the resolved domain of every member.
 *
 * Each chart is 1000px wide over a 9-day extent so plot-x maps cleanly, and
 * `curve="linear"` makes each drawn point one `M`/`L` command to count.
 */
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { Dashboard, DashboardSection } from "@silkplot/solid";
import { LineChart } from "../src/index";
import type { TimePoint } from "../src/index";

const T0 = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;
const day = (n: number): Date => new Date(T0 + n * DAY);
const DATA: TimePoint[] = Array.from({ length: 10 }, (_, n) => ({ t: day(n), y: 10 + n }));
const NO_MARGINS = { top: 0, right: 0, bottom: 0, left: 0 } as const;

/** The drawn point count of each chart, in DOM order — one entry per `<svg>`. */
function pointCounts(container: HTMLElement): number[] {
  return [...container.querySelectorAll("svg")].map((svg) => {
    const mark = [...svg.querySelectorAll("g > path")].find(
      (p) => p.closest("[data-silkplot-axis]") === null,
    );
    const d = mark?.getAttribute("d") ?? "";
    return (d.match(/[ML]/g) ?? []).length;
  });
}

function surfaces(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("[data-silkplot-keyboard-surface]")];
}

function pointer(
  el: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  plotX: number,
): void {
  const clientX = el.getBoundingClientRect().left + plotX;
  el.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, clientX, bubbles: true, cancelable: true }),
  );
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function threeChartDashboard() {
  return render(() => (
    <Dashboard defaultRange={{ start: day(0), end: day(9) }}>
      {/* A — the one dragged */}
      <LineChart title="A" data={DATA} brushSelect width={1000} height={100} margins={NO_MARGINS} curve="linear" />
      {/* B — an unsectioned follower */}
      <LineChart title="B" data={DATA} width={1000} height={100} margins={NO_MARGINS} curve="linear" />
      {/* C — isolated in a section over [day 6, day 8], so 3 points, and it must
          NOT move when the shared selection changes. */}
      <DashboardSection label="Focus" window={{ start: day(6), end: day(8) }}>
        <LineChart title="C" data={DATA} width={1000} height={100} margins={NO_MARGINS} curve="linear" />
      </DashboardSection>
    </Dashboard>
  ));
}

describe("dashboard-linked drag selection", () => {
  it("a drag on one member sets the shared selection; unsectioned members follow, the section is isolated", async () => {
    const { container } = threeChartDashboard();
    // Before: A and B show the whole global range (10 points); C its section (3).
    const before = pointCounts(container);
    expect(before[0]).toBe(10);
    expect(before[1]).toBe(10);
    expect(before[2]).toBe(3);

    // Drag across the middle of chart A.
    const a = surfaces(container)[0] as HTMLElement;
    pointer(a, "pointerdown", 300);
    pointer(a, "pointermove", 600);
    await nextFrame();
    pointer(a, "pointerup", 600);

    const after = pointCounts(container);
    // A and B narrowed to the SAME dragged sub-range.
    expect(after[0]).toBeLessThan(10);
    expect(after[0]).toBeGreaterThanOrEqual(2);
    expect(after[1]).toBe(after[0]);
    // C, isolated in its section, did not move.
    expect(after[2]).toBe(3);
  });

  it("a press-and-release without moving does not select", async () => {
    const { container } = threeChartDashboard();
    const a = surfaces(container)[0] as HTMLElement;
    pointer(a, "pointerdown", 400);
    pointer(a, "pointermove", 401); // below the min-travel threshold
    await nextFrame();
    pointer(a, "pointerup", 401);
    // Nothing narrowed — a click is not a selection.
    expect(pointCounts(container)).toEqual([10, 10, 3]);
  });

  it("announces the settled selection once, not during the drag", async () => {
    const { container } = threeChartDashboard();
    const region = (): string =>
      container.querySelector('[data-silkplot-announcer="selection"]')?.textContent ?? "";
    const a = surfaces(container)[0] as HTMLElement;
    expect(region()).toBe("");

    // Nothing is announced DURING the drag — the brush commits on release.
    pointer(a, "pointerdown", 300);
    pointer(a, "pointermove", 500);
    pointer(a, "pointermove", 600);
    await nextFrame();
    expect(region()).toBe("");

    // One announcement on settle.
    pointer(a, "pointerup", 600);
    await nextFrame();
    expect(region()).toContain("Selected");
  });

  it("the keyboard reaches the same shared selection (input parity)", () => {
    const { container } = threeChartDashboard();
    const a = surfaces(container)[0] as HTMLElement;
    // Zoom in on A via the keyboard — inside a dashboard this drives the shared
    // dynamic selection, so B follows too.
    a.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }));
    const after = pointCounts(container);
    expect(after[0]).toBeLessThan(10);
    expect(after[1]).toBe(after[0]); // B followed
    expect(after[2]).toBe(3); // C isolated
  });

  it("a MULTI-SERIES member drives and follows the shared selection too", async () => {
    const series = [{ id: "s", label: "S", data: DATA }];
    const { container } = render(() => (
      <Dashboard defaultRange={{ start: day(0), end: day(9) }}>
        <LineChart title="A" series={series} brushSelect width={1000} height={100} margins={NO_MARGINS} curve="linear" />
        <LineChart title="B" series={series} width={1000} height={100} margins={NO_MARGINS} curve="linear" />
      </Dashboard>
    ));
    expect(pointCounts(container)).toEqual([10, 10]);
    const a = surfaces(container)[0] as HTMLElement;
    pointer(a, "pointerdown", 300);
    pointer(a, "pointermove", 600);
    await nextFrame();
    pointer(a, "pointerup", 600);
    const after = pointCounts(container);
    expect(after[0]).toBeLessThan(10);
    expect(after[1]).toBe(after[0]);
  });
});
