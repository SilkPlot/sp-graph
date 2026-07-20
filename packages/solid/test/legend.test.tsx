/**
 * The legend, per ADR-0008 §6 and the toolbar keyboard model.
 *
 * Two properties are asserted harder than the rest, because both are things a
 * legend can lose while continuing to look and behave correctly in a demo:
 *
 *   - **Navigation is never trapped.** Tab is not a key this toolbar handles
 *     well; it is a key the toolbar never touches. The tests tab THROUGH the
 *     legend, from a control before it to a control after it, rather than
 *     asserting that some handler declined to intercept.
 *   - **Colour is never the only channel.** A legend whose entries differ only
 *     in hue passes every structural assertion ever written about it. The
 *     swatch's dash pattern and the entry's label are asserted directly.
 *
 * Real browser, not jsdom: focus, tab order, roving `tabindex`, and computed
 * `stroke-dasharray` are browser behaviour, and a fake DOM would let all of
 * them pass while being wrong.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { userEvent } from "@vitest/browser/context";
import type { Series } from "@silkplot/core";
import { Legend, MIN_TARGET_PX } from "../src/index";

const at = (hour: number): Date => new Date(Date.UTC(2026, 2, 1, hour));

const series = (id: string, label = id.toUpperCase()): Series => ({
  id,
  label,
  data: [
    { t: at(0), y: 1 },
    { t: at(1), y: 2 },
  ],
});

const THREE: readonly Series[] = [series("a"), series("b"), series("c")];

const items = (container: HTMLElement): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button[data-sp-legend-item]"));

const labels = (container: HTMLElement): string[] =>
  items(container).map((b) => b.textContent?.trim() ?? "");

const pressed = (container: HTMLElement): (string | null)[] =>
  items(container).map((b) => b.getAttribute("aria-pressed"));

describe("structure", () => {
  it("is a toolbar with one entry per series, in the caller's order", () => {
    const { container } = render(() => <Legend series={THREE} />);

    expect(container.querySelector("[role='toolbar']")).not.toBeNull();
    // Order is the caller's (ADR-0008 §5) — the legend does not tidy it either.
    expect(labels(container)).toEqual(["A", "B", "C"]);
  });

  it("names the toolbar generically, and takes the caller's wording when given", () => {
    const { container } = render(() => <Legend series={THREE} />);
    expect(container.querySelector("[role='toolbar']")?.getAttribute("aria-label")).toBe("Series");

    const custom = render(() => <Legend series={THREE} label="Sensors" />);
    expect(custom.container.querySelector("[role='toolbar']")?.getAttribute("aria-label")).toBe(
      "Sensors",
    );
  });

  it("starts with every series visible when uncontrolled", () => {
    const { container } = render(() => <Legend series={THREE} />);
    expect(pressed(container)).toEqual(["true", "true", "true"]);
  });

  it("gives every entry at least the minimum target size", () => {
    const { container } = render(() => <Legend series={THREE} />);
    for (const button of items(container)) {
      const box = button.getBoundingClientRect();
      // Measured, not asserted against the style attribute: a `min-height` that
      // a flex parent overrode would still read correctly in the CSS.
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    }
  });
});

describe("colour is never the only channel (ADR-0005 §5)", () => {
  it("gives each swatch a dash pattern as well as a colour", () => {
    const { container } = render(() => <Legend series={THREE} />);
    const lines = container.querySelectorAll("svg line");

    expect(lines).toHaveLength(3);
    // Index 0 is deliberately solid, so an ordinary one-series legend is not
    // gratuitously dashed. Entries beyond it must carry a distinct pattern —
    // this is what separates two series a colour-blind reader sees as one hue.
    const dashes = Array.from(lines).map((l) => l.getAttribute("stroke-dasharray"));
    expect(new Set(dashes).size).toBe(3);
  });

  it("carries the label as text, not only as a swatch colour", () => {
    const { container } = render(() => <Legend series={[series("inlet", "Inlet temperature")]} />);
    // The channel that survives monochrome printing, colour blindness, and a
    // screen reader alike.
    expect(container.textContent).toContain("Inlet temperature");
  });

  it("marks a hidden series with aria-pressed, not only with opacity", () => {
    const { container } = render(() => <Legend series={THREE} visibleSeries={["a", "c"]} />);
    // Opacity alone would be a colour-only encoding of STATE — the same failure
    // the palette avoids with its dash channel, one level up.
    expect(pressed(container)).toEqual(["true", "false", "true"]);
  });

  it("hollows a hidden swatch as well as dimming the entry", () => {
    const { container } = render(() => <Legend series={THREE} visibleSeries={["a"]} />);
    const opacities = Array.from(container.querySelectorAll("svg line")).map((l) =>
      Number(l.getAttribute("stroke-opacity")),
    );
    expect(opacities[0]).toBe(1);
    expect(opacities[1]).toBeLessThan(1);
  });
});

describe("visibility state (ADR-0008 §6)", () => {
  it("toggles its own state when uncontrolled", async () => {
    const { container } = render(() => <Legend series={THREE} />);

    await userEvent.click(items(container)[1] as HTMLButtonElement);
    expect(pressed(container)).toEqual(["true", "false", "true"]);

    await userEvent.click(items(container)[1] as HTMLButtonElement);
    expect(pressed(container)).toEqual(["true", "true", "true"]);
  });

  it("reports the next visible set rather than the toggled id", async () => {
    const seen: (readonly string[])[] = [];
    const { container } = render(() => (
      <Legend series={THREE} onVisibilityChange={(v) => seen.push(v)} />
    ));

    await userEvent.click(items(container)[1] as HTMLButtonElement);
    // The whole array, so a caller can hand it straight back as `visibleSeries`
    // without reconstructing it — which is what makes isolate and show-all
    // caller operations over one array rather than separate modes.
    expect(seen).toEqual([["a", "c"]]);
  });

  it("obeys the caller when controlled, and does NOT move on its own", async () => {
    const seen: (readonly string[])[] = [];
    const { container } = render(() => (
      <Legend series={THREE} visibleSeries={["a", "b", "c"]} onVisibilityChange={(v) => seen.push(v)} />
    ));

    await userEvent.click(items(container)[0] as HTMLButtonElement);

    // The handler fired, and the rendered state did NOT change — because the
    // caller did not change the prop. A controlled component that also updates
    // itself is the bug where state briefly disagrees with its owner.
    expect(seen).toEqual([["b", "c"]]);
    expect(pressed(container)).toEqual(["true", "true", "true"]);
  });

  it("treats the empty set as a real state, not as 'no filter'", () => {
    const { container } = render(() => <Legend series={THREE} visibleSeries={[]} />);
    // The classic filter bug: deselect the last series and every series
    // reappears. Every entry must read unpressed.
    expect(pressed(container)).toEqual(["false", "false", "false"]);
  });

  it("ignores an id no series has, rather than throwing", () => {
    // Data and visibility arrive from different places and are momentarily out
    // of step during every replacement (ADR-0008 §6).
    expect(() =>
      render(() => <Legend series={THREE} visibleSeries={["a", "ghost"]} />),
    ).not.toThrow();
  });

  it("supports isolate and show-all as ordinary array operations", () => {
    const [visible, setVisible] = createSignal<readonly string[]>(["a", "b", "c"]);
    const { container } = render(() => (
      <Legend series={THREE} visibleSeries={visible()} onVisibilityChange={setVisible} />
    ));

    setVisible(["b"]);
    expect(pressed(container)).toEqual(["false", "true", "false"]);

    setVisible(["a", "b", "c"]);
    expect(pressed(container)).toEqual(["true", "true", "true"]);
  });
});

describe("the toolbar keyboard model", () => {
  it("is ONE tab stop, whatever the series count", async () => {
    const many = Array.from({ length: 22 }, (_, i) => series(`s${i}`));
    const { container } = render(() => (
      <>
        <button type="button">before</button>
        <Legend series={many} />
        <button type="button">after</button>
      </>
    ));

    // Exactly one entry is tabbable. The whole reason this is a toolbar rather
    // than 22 buttons: 22 tab stops between the chart and the rest of the page.
    const tabbable = items(container).filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(items(container)).toHaveLength(22);
  });

  it("never traps Tab — the page stays navigable in both directions", async () => {
    const { container } = render(() => (
      <>
        <button type="button">before</button>
        <Legend series={THREE} />
        <button type="button">after</button>
      </>
    ));
    const before = container.querySelector("button") as HTMLButtonElement;
    const after = Array.from(container.querySelectorAll("button")).at(-1) as HTMLButtonElement;

    before.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(items(container)[0]);

    // Forward OUT of the legend, not to the next entry.
    await userEvent.tab();
    expect(document.activeElement).toBe(after);

    // And back in reverse. Tabbing through is the assertion; checking that a
    // handler chose not to intercept would not prove the page is navigable.
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(items(container)[0]);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(before);
  });

  it("moves between entries with the arrow keys", async () => {
    const { container } = render(() => <Legend series={THREE} />);
    items(container)[0]?.focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(items(container)[1]);

    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(items(container)[2]);

    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(items(container)[1]);
  });

  it("wraps at both ends, and Home/End jump", async () => {
    const { container } = render(() => <Legend series={THREE} />);
    items(container)[0]?.focus();

    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(items(container)[2]);

    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(items(container)[0]);

    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(items(container)[2]);

    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(items(container)[0]);
  });

  it("moves the single tab stop with the cursor", async () => {
    const { container } = render(() => <Legend series={THREE} />);
    items(container)[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");

    // The roving half of roving tabindex: leaving and re-entering the legend
    // must return to where the user was, not to the first entry.
    expect(items(container).map((b) => b.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("toggles with the keyboard, producing the same result as a click", async () => {
    const { container } = render(() => <Legend series={THREE} />);
    items(container)[1]?.focus();

    await userEvent.keyboard(" ");
    expect(pressed(container)).toEqual(["true", "false", "true"]);

    await userEvent.keyboard("{Enter}");
    expect(pressed(container)).toEqual(["true", "true", "true"]);
  });
});

describe("series replacement leaves no stale state", () => {
  it("keeps the tab stop valid when the focused series is removed", async () => {
    const [list, setList] = createSignal<readonly Series[]>(THREE);
    const { container } = render(() => <Legend series={list()} />);

    items(container)[2]?.focus();
    await userEvent.keyboard("{End}");

    setList([series("a"), series("b")]);

    // The cursor pointed at index 2, which no longer exists. Exactly one entry
    // must still be tabbable — a cursor left dangling would take the legend out
    // of the tab order entirely, and nothing on screen would say so.
    const tabbable = items(container).filter((b) => b.getAttribute("tabindex") === "0");
    expect(items(container)).toHaveLength(2);
    expect(tabbable).toHaveLength(1);
  });

  it("follows a reorder by identity, not by position", () => {
    const [list, setList] = createSignal<readonly Series[]>(THREE);
    const { container } = render(() => <Legend series={list()} visibleSeries={["b"]} />);

    expect(pressed(container)).toEqual(["false", "true", "false"]);

    setList([THREE[2] as Series, THREE[1] as Series, THREE[0] as Series]);

    // "b" is still the visible one and is now in the middle by coincidence —
    // so the labels are asserted alongside, or this passes against a legend
    // that ignored the reorder completely.
    expect(labels(container)).toEqual(["C", "B", "A"]);
    expect(pressed(container)).toEqual(["false", "true", "false"]);
  });

  it("renders nothing but the toolbar for an empty series array", () => {
    const { container } = render(() => <Legend series={[]} />);
    expect(container.querySelector("[role='toolbar']")).not.toBeNull();
    expect(items(container)).toHaveLength(0);
  });
});

describe("layout", () => {
  it("wraps by default and stacks on request", () => {
    const wrap = render(() => <Legend series={THREE} />);
    const toolbar = wrap.container.querySelector("[role='toolbar']") as HTMLElement;
    expect(getComputedStyle(toolbar).flexWrap).toBe("wrap");
    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal");

    const stack = render(() => <Legend series={THREE} layout="stack" />);
    const stacked = stack.container.querySelector("[role='toolbar']") as HTMLElement;
    expect(getComputedStyle(stacked).flexDirection).toBe("column");
    // The orientation is not decoration: it tells a screen reader which arrow
    // keys to expect, and a vertical toolbar announcing "horizontal" teaches
    // the wrong gesture.
    expect(stacked.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("scrolls rather than clipping when capped", () => {
    const many = Array.from({ length: 22 }, (_, i) => series(`s${i}`));
    const { container } = render(() => <Legend series={many} layout="stack" maxHeight="80px" />);
    const toolbar = container.querySelector("[role='toolbar']") as HTMLElement;

    // Clipping would hide the control for a series the chart is still drawing,
    // with nothing on screen to say the control exists.
    expect(getComputedStyle(toolbar).overflowY).toBe("auto");
    expect(toolbar.scrollHeight).toBeGreaterThan(toolbar.clientHeight);
  });
});

describe("announcement posture (ADR-0005 §4)", () => {
  it("carries NO live region — aria-pressed is the announcement", async () => {
    const { container } = render(() => <Legend series={THREE} />);

    // Deliberate, and asserted so nobody adds one later "for accessibility".
    // A toggle button's `aria-pressed` change is already announced by every
    // screen reader; a live region alongside it announces the same state twice.
    // This library has met that failure before — the chart's `live` and
    // `option` announcement channels are mutually exclusive by construction for
    // exactly this reason.
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector("[role='status']")).toBeNull();
    expect(container.querySelector("[role='alert']")).toBeNull();

    // And the state that IS announced changes on toggle.
    await userEvent.click(items(container)[0] as HTMLButtonElement);
    expect(items(container)[0]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the accessible name stable across a toggle", async () => {
    const { container } = render(() => <Legend series={THREE} />);
    const before = items(container)[0]?.textContent?.trim();

    await userEvent.click(items(container)[0] as HTMLButtonElement);

    // The NAME must not change with the state — a button relabelled from
    // "Series A" to "Show series A" announces as a different control, and a
    // reader that had it in a list finds the list rewritten under them. The
    // state travels on `aria-pressed`, which is what it is for.
    expect(items(container)[0]?.textContent?.trim()).toBe(before);
  });
});

describe("rapid toggling", () => {
  it("settles on the correct state after a burst on one entry", async () => {
    const seen: (readonly string[])[] = [];
    const { container } = render(() => (
      <Legend series={THREE} onVisibilityChange={(v) => seen.push(v)} />
    ));
    const first = items(container)[0] as HTMLButtonElement;

    for (let i = 0; i < 6; i += 1) await userEvent.click(first);

    // An even number of toggles returns to visible. A component that dropped or
    // coalesced an event would land on the opposite state, and a single
    // click-and-check test cannot tell the difference.
    expect(seen).toHaveLength(6);
    expect(pressed(container)).toEqual(["true", "true", "true"]);
  });

  it("keeps each entry's state independent under an interleaved burst", async () => {
    const { container } = render(() => <Legend series={THREE} />);

    await userEvent.click(items(container)[0] as HTMLButtonElement);
    await userEvent.click(items(container)[1] as HTMLButtonElement);
    await userEvent.click(items(container)[0] as HTMLButtonElement);
    await userEvent.click(items(container)[2] as HTMLButtonElement);

    // a toggled twice (visible), b and c once each (hidden). A shared cursor or
    // a last-write-wins bug would collapse these into one state.
    expect(pressed(container)).toEqual(["true", "false", "false"]);
  });

  it("survives a burst driven from the keyboard", async () => {
    const { container } = render(() => <Legend series={THREE} />);
    items(container)[0]?.focus();

    await userEvent.keyboard(" {ArrowRight} {ArrowRight} ");

    // Toggle, move, toggle, move, toggle — the pointer and keyboard paths write
    // the same state, so a burst mixing navigation and activation must not
    // leave the roving cursor and the pressed state disagreeing.
    expect(pressed(container)).toEqual(["false", "false", "false"]);
    expect(document.activeElement).toBe(items(container)[2]);
  });
});

describe("theme", () => {
  it("resolves swatch colour through a token, not a baked literal", () => {
    const { container } = render(() => <Legend series={THREE} />);
    const strokes = Array.from(container.querySelectorAll("svg line")).map((l) =>
      l.getAttribute("stroke"),
    );

    // `var(--sp-cat-N, currentColor)` — the scheme x contrast cascade resolves
    // it. A hex literal here would freeze one surface's palette into the markup
    // and the legend would stop following the theme the chart follows.
    for (const stroke of strokes) {
      expect(stroke).toMatch(/^var\(--sp-cat-\d+, currentColor\)$/);
    }
  });

  it("takes its text colour from a token with an inheriting fallback", () => {
    const { container } = render(() => <Legend series={THREE} />);
    const button = items(container)[0] as HTMLButtonElement;

    // The fallback matters for a consumer shipping no theme at all: they get a
    // legible legend in the inherited colour rather than an invisible one.
    expect(button.style.color).toContain("--sp-color-text");
    expect(button.style.color).toContain("currentColor");
  });

  it("respects a caller's own stroke while keeping the dash channel", () => {
    const branded: readonly Series[] = [
      { ...series("a"), style: { stroke: "#ff0000" } },
      series("b"),
    ];
    const { container } = render(() => <Legend series={branded} />);
    const lines = Array.from(container.querySelectorAll("svg line"));

    // Per-property override: picking a brand colour must not silently discard
    // the non-colour channel, which is the most likely thing a caller does.
    expect(lines[0]?.getAttribute("stroke")).toBe("#ff0000");
    expect(lines[0]?.getAttribute("stroke-dasharray")).toMatch(/--sp-cat-dash-/);
  });
});

describe("several charts, one legend", () => {
  it("drives every subscriber from one state", async () => {
    // The case that motivated a standalone legend at all (ADR-0008 §6). Two
    // consumers stand in for two charts, so this asserts the wiring rather than
    // re-testing the charts, which the seam suite in `charts` already covers.
    const [visible, setVisible] = createSignal<readonly string[]>(["a", "b", "c"]);
    const { container } = render(() => (
      <>
        <Legend series={THREE} visibleSeries={visible()} onVisibilityChange={setVisible} />
        <div data-first>{visible().join(",")}</div>
        <div data-second>{visible().join(",")}</div>
      </>
    ));

    await userEvent.click(items(container)[1] as HTMLButtonElement);

    expect(container.querySelector("[data-first]")?.textContent).toBe("a,c");
    expect(container.querySelector("[data-second]")?.textContent).toBe("a,c");
  });

  it("keeps two legends over one state in step with each other", async () => {
    const [visible, setVisible] = createSignal<readonly string[]>(["a", "b", "c"]);
    const { container } = render(() => (
      <>
        <Legend series={THREE} visibleSeries={visible()} onVisibilityChange={setVisible} label="A" />
        <Legend series={THREE} visibleSeries={visible()} onVisibilityChange={setVisible} label="B" />
      </>
    ));

    const all = items(container);
    expect(all).toHaveLength(6);

    await userEvent.click(all[1] as HTMLButtonElement);

    // Both legends reflect the change, because neither owns the state. A legend
    // that kept private state alongside the controlled prop would leave the two
    // disagreeing, each individually plausible.
    expect(pressed(container)).toEqual(["true", "false", "true", "true", "false", "true"]);
  });
});
