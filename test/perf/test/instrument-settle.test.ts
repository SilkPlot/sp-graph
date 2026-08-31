import { afterEach, describe, expect, it } from "vitest";
import { SETTLE_TIMEOUT, settle } from "../app/instrument";

afterEach(() => {
  document.body.replaceChildren();
});

describe("settle timeout evidence", () => {
  it("does not report continuous mutation as a successful settle", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let active = true;
    const mutate = (): void => {
      if (!active) return;
      root.toggleAttribute("data-moving");
      requestAnimationFrame(mutate);
    };

    const result = await settle(root, () => requestAnimationFrame(mutate), {
      quietMs: 30,
      timeoutMs: 120,
    });
    active = false;

    expect(result).toBe(SETTLE_TIMEOUT);
  });
});
