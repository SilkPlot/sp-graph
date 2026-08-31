import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createProbeSnapshot } from "./probe-snapshot.mjs";

test("a probe snapshot can mutate source and dependencies without touching the checkout", (context) => {
  const source = mkdtempSync(join(tmpdir(), "silkplot-probe-source-"));
  context.after(() => rmSync(source, { recursive: true, force: true }));
  mkdirSync(join(source, "src"));
  mkdirSync(join(source, "node_modules", "fixture"), { recursive: true });
  writeFileSync(join(source, "package.json"), "{}\n");
  writeFileSync(join(source, "src", "value.ts"), "export const value = 1;\n");
  writeFileSync(join(source, "node_modules", "fixture", "index.js"), "export default 1;\n");
  symlinkSync("src/value.ts", join(source, "value-link.ts"));

  const snapshot = createProbeSnapshot(source, ["package.json", "src/value.ts", "value-link.ts"]);
  context.after(snapshot.cleanup);

  writeFileSync(join(snapshot.root, "src", "value.ts"), "export const value = -1;\n");
  writeFileSync(
    join(snapshot.root, "node_modules", "fixture", "index.js"),
    "export default -1;\n",
  );

  assert.equal(readFileSync(join(source, "src", "value.ts"), "utf8"), "export const value = 1;\n");
  assert.equal(
    readFileSync(join(source, "node_modules", "fixture", "index.js"), "utf8"),
    "export default 1;\n",
  );
  assert.equal(readlinkSync(join(snapshot.root, "value-link.ts")), "src/value.ts");
  const container = dirname(snapshot.root);
  snapshot.cleanup();
  assert.equal(existsSync(container), false);
});

test("a probe snapshot rejects a path outside its source root", (context) => {
  const source = mkdtempSync(join(tmpdir(), "silkplot-probe-source-"));
  context.after(() => rmSync(source, { recursive: true, force: true }));
  mkdirSync(join(source, "node_modules"));
  assert.throws(() => createProbeSnapshot(source, ["../outside.md"]), /outside source root/);
});
