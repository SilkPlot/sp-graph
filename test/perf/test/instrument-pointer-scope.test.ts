/**
 * The pointer-scope observer's own regression suite.
 *
 * This suite exists because the harness that proves the library's pointer
 * contract had no test of its own, and shipped an observer whose window was
 * closed for every event a browser dispatched. Three counters
 * (`layoutReadsInPointer`, `productionIndexBuildsInPointer`,
 * `injectedRebuildsInPointer`) read zero unconditionally, and the two clean-pass
 * invariants built on them reported PASS on a zero they could not exceed.
 * A check that cannot fail is not evidence.
 *
 * ---------------------------------------------------------------------------
 * Why this suite must drive TRUSTED events
 * ---------------------------------------------------------------------------
 * The defect is invisible to `dispatchEvent`. A synthetic dispatch runs inside
 * an already-executing task, so the JS stack is non-empty and no microtask
 * checkpoint interleaves between the window-capture opener and the
 * document-capture listener under observation. Measured, both ways, against the
 * shipped `queueMicrotask` clear:
 *
 *   | driver                     | counted |
 *   |----------------------------|---------|
 *   | trusted (browser dispatch) |  0 / 10 |
 *   | synthetic `dispatchEvent`  | 10 / 10 |
 *
 * So `userEvent` — Playwright's real input pipeline — is not a stylistic choice
 * here. A suite written against `dispatchEvent` passes against the broken code
 * and would have shipped the same hole a second time.
 *
 * ---------------------------------------------------------------------------
 * Why it asserts a ceiling as well as a floor
 * ---------------------------------------------------------------------------
 * The obvious repair is to close the window later — `setTimeout(…, 0)` or
 * `requestAnimationFrame`. Both restore the count and both then attribute work
 * that ran later in the same task or frame but NOT in the pointer handler.
 * Deferring is the fix the contract asks for, so counting deferred work would
 * report the fix as the defect. `defers work out of scope` is therefore a
 * required half of this suite, not an extra: it is what stops a future session
 * from repairing the floor by widening past the ceiling.
 */
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createInvariants } from "../app/instrument";

/** A parked mouse over freshly-appearing content fires boundary events; keep targets apart. */
const surface = (label: string): HTMLElement => {
  const element = document.createElement("div");
  element.dataset.testid = label;
  element.style.cssText = "position:fixed;width:120px;height:120px;background:#ccc";
  element.style.left = label === "a" ? "20px" : "220px";
  element.style.top = "20px";
  document.body.append(element);
  return element;
};

let active: ReturnType<typeof createInvariants> | undefined;
const cleanup: (() => void)[] = [];

afterEach(() => {
  // stop() restores the patched getBoundingClientRect. Leaving it patched would
  // leak this suite's instrument into every later test in the run.
  active?.stop();
  active = undefined;
  for (const undo of cleanup.splice(0)) undo();
  document.body.replaceChildren();
});

/** Drive two real pointer moves through the browser's own input pipeline. */
const twoTrustedMoves = async (): Promise<void> => {
  const a = surface("a");
  const b = surface("b");
  await userEvent.hover(a);
  await userEvent.hover(b);
};

describe("pointer-scope observation window", () => {
  it("attributes a layout read made by a document-capture listener to the pointer event", async () => {
    const invariants = createInvariants();
    active = invariants;
    invariants.start();

    // Exactly the registration `setPathological` uses: document, capture phase,
    // added after the observer's own window-capture opener.
    const read = (): void => {
      document.body.getBoundingClientRect();
    };
    document.addEventListener("pointermove", read, { capture: true });
    cleanup.push(() => document.removeEventListener("pointermove", read, { capture: true }));

    await twoTrustedMoves();
    const counts = invariants.read();

    expect(counts.pointerEvents).toBeGreaterThan(0);
    expect(counts.layoutReadsInPointer).toBeGreaterThan(0);
    expect(counts.pointerEventsWithOneLayoutRead).toBeGreaterThan(0);
  });

  it("attributes an injected rebuild noted by a document-capture listener", async () => {
    const invariants = createInvariants();
    active = invariants;
    invariants.start();

    const note = (): void => invariants.noteInjectedRebuild();
    document.addEventListener("pointermove", note, { capture: true });
    cleanup.push(() => document.removeEventListener("pointermove", note, { capture: true }));

    await twoTrustedMoves();
    const counts = invariants.read();

    expect(counts.injectedRebuildsInPointer).toBeGreaterThan(0);
    expect(counts.pointerEventsWithOneInjectedRebuild).toBeGreaterThan(0);
  });

  it("defers work out of scope — a later task and a later frame are not counted", async () => {
    const invariants = createInvariants();
    active = invariants;
    invariants.start();

    const defer = (): void => {
      setTimeout(() => {
        document.body.getBoundingClientRect();
      }, 0);
      requestAnimationFrame(() => {
        document.body.getBoundingClientRect();
      });
    };
    document.addEventListener("pointermove", defer, { capture: true });
    cleanup.push(() => document.removeEventListener("pointermove", defer, { capture: true }));

    await twoTrustedMoves();
    // Outlast both the macrotask and the frame the handler deferred into.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const counts = invariants.read();

    expect(counts.pointerEvents).toBeGreaterThan(0);
    expect(counts.layoutReadsInPointer).toBe(0);
  });
});
