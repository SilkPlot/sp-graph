/**
 * ChartAnnouncer's throttling contract, per ADR-0005 §4.
 *
 * What is asserted here is deliberately narrower than "the user hears this".
 * Screen readers queue, coalesce, or drop rapid live-region updates and differ
 * materially by reader and version, so the primitive promises modest,
 * de-duplicated, throttleable announcements and nothing more. What a test CAN
 * hold it to is what it writes into the region, so that is what is measured —
 * every write to the live region's text, counted with a MutationObserver rather
 * than inferred from the final value.
 *
 * The two halves of the contract are opposites and both matter:
 *
 *   - **not emitted faster than the contract permits** — a burst inside one
 *     window produces at most the leading message and one trailing message, not
 *     one per update;
 *   - **not lost** — the LAST message of a burst is always written. A coalescing
 *     scheme that dropped the final state would leave the region describing a
 *     point the user has already stepped away from.
 */
import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { render } from "@solidjs/testing-library";
import { ChartAnnouncer, DEFAULT_ANNOUNCE_THROTTLE_MS } from "../src/index";

const THROTTLE = 100;

/** Let Solid's effects flush, without waiting a timer window. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface Harness {
  region: HTMLElement;
  /** Every value the region's text has been set to, in order. */
  writes: string[];
  set(message: string): Promise<void>;
  stop(): void;
}

function mount(throttleMs = THROTTLE): Harness {
  const [message, setMessage] = createSignal("");
  const { container } = render(() => (
    <ChartAnnouncer message={message()} throttleMs={throttleMs} />
  ));
  const region = container.querySelector<HTMLElement>("[data-silkplot-announcer]");
  if (!region) throw new Error("announcer not rendered");

  const writes: string[] = [];
  const observer = new MutationObserver(() => {
    const text = region.textContent ?? "";
    if (writes[writes.length - 1] !== text) writes.push(text);
  });
  observer.observe(region, { childList: true, characterData: true, subtree: true });

  return {
    region,
    writes,
    set: async (m: string) => {
      setMessage(m);
      await tick();
    },
    stop: () => observer.disconnect(),
  };
}

describe("ChartAnnouncer throttling", () => {
  it("writes the first message of a burst immediately", async () => {
    const h = mount();
    try {
      await h.set("Bookings, 4 March, 42 appointments");
      // Leading edge: a single deliberate arrow press must not feel delayed.
      expect(h.region.textContent).toBe("Bookings, 4 March, 42 appointments");
    } finally {
      h.stop();
    }
  });

  it("coalesces a burst into at most two writes per window", async () => {
    const h = mount();
    try {
      await h.set("point 1");
      await h.set("point 2");
      await h.set("point 3");
      await h.set("point 4");

      // Still inside the window: only the leading message has landed.
      expect(h.writes).toEqual(["point 1"]);

      await wait(THROTTLE * 2);
      expect(h.writes.length).toBeLessThanOrEqual(2);
    } finally {
      h.stop();
    }
  });

  it("never loses the last message of a burst", async () => {
    const h = mount();
    try {
      for (const m of ["point 1", "point 2", "point 3", "point 4", "point 5"]) {
        await h.set(m);
      }
      await wait(THROTTLE * 2);
      // The intermediate steps are gone, which is the point. The one the user
      // actually landed on is not.
      expect(h.region.textContent).toBe("point 5");
      expect(h.writes).toContain("point 5");
      expect(h.writes).not.toContain("point 3");
    } finally {
      h.stop();
    }
  });

  it("re-opens after the window, so a slow walk is announced step by step", async () => {
    const h = mount();
    try {
      await h.set("point 1");
      await wait(THROTTLE * 1.5);
      await h.set("point 2");
      await wait(THROTTLE * 1.5);
      await h.set("point 3");
      await wait(THROTTLE * 1.5);
      // Nothing coalesced: each step stood alone.
      expect(h.writes).toEqual(["point 1", "point 2", "point 3"]);
    } finally {
      h.stop();
    }
  });

  it("does not re-announce an unchanged message", async () => {
    const h = mount();
    try {
      await h.set("point 1");
      await wait(THROTTLE * 2);
      await h.set("point 1");
      await h.set("point 1");
      await wait(THROTTLE * 2);
      // A re-render producing the same sentence is not a state change the user
      // committed to. Writing it again is how a live region starts repeating.
      expect(h.writes).toEqual(["point 1"]);
    } finally {
      h.stop();
    }
  });

  it("clears immediately and unthrottled", async () => {
    const h = mount();
    try {
      await h.set("point 1");
      await h.set("");
      // Emptying a region announces nothing, so there is nothing to throttle —
      // and a stale sentence left behind is exactly what is being cleared.
      expect(h.region.textContent).toBe("");
    } finally {
      h.stop();
    }
  });

  it("does not let a cleared message resurrect a coalesced one", async () => {
    const h = mount();
    try {
      await h.set("point 1");
      await h.set("point 2");
      await h.set("");
      await wait(THROTTLE * 2);
      // "point 2" was pending when the clear arrived. Flushing it afterwards
      // would announce a point the user has already left.
      expect(h.region.textContent).toBe("");
      expect(h.writes).not.toContain("point 2");
    } finally {
      h.stop();
    }
  });

  it("stays a polite status region while throttling", () => {
    const { container } = render(() => <ChartAnnouncer message="x" />);
    const el = container.querySelector("[data-silkplot-announcer]");
    expect(el?.getAttribute("aria-live")).toBe("polite");
    expect(el?.getAttribute("role")).toBe("status");
  });

  it("documents its default policy as a number, not a hidden constant", () => {
    // The value is an engineering policy and is exported so an application can
    // disagree with it. ADR-0005 records that no published figure would be more
    // honest than a reasoned one.
    expect(DEFAULT_ANNOUNCE_THROTTLE_MS).toBe(150);
  });

  it("CONTROL: the observer sees every write, so a coalescing claim can fail", async () => {
    // Anti-vacuity. With throttling effectively off, the same burst must produce
    // one write per message — otherwise the counts above would be measuring a
    // broken observer rather than the throttle.
    const h = mount(0);
    try {
      for (const m of ["a", "b", "c", "d"]) {
        await h.set(m);
        await wait(5);
      }
      await wait(20);
      expect(h.writes).toEqual(["a", "b", "c", "d"]);
    } finally {
      h.stop();
    }
  });
});
