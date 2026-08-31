import { describe, expect, it } from "vitest";
import { visibilityStateChanged } from "../app/state";

describe("performance visibility reachability", () => {
  it("does not count a no-op state write as a visibility commit", () => {
    expect(visibilityStateChanged(["a", "b"], ["a", "b"])).toBe(false);
  });

  it("counts an adopted visible-series transition", () => {
    expect(visibilityStateChanged(["a", "b"], ["a"])).toBe(true);
  });
});
