import { writeFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * Record which file every `@silkplot/*` import actually resolved to.
 *
 * The two resolution paths are the whole point of this fixture, and "the build
 * succeeded" does not distinguish them: a Solid-aware build and a Solid-blind one
 * both produce a working bundle, from different files, and a mistake that
 * collapses one into the other is invisible in the output. So the build reports
 * what it loaded and the gate asserts on that, rather than inferring it from a
 * config it wrote itself.
 *
 * `load` rather than `resolveId`: by the time a module is loaded, the id IS the
 * resolved absolute path, with every condition already applied.
 */
export function recordResolution(outFile: string): Plugin {
  const loaded = new Set<string>();
  return {
    name: "silkplot-record-resolution",
    load(id) {
      const match = /node_modules\/(@silkplot\/[^/]+\/.+)$/.exec(id.split("?")[0] ?? id);
      if (match?.[1] !== undefined) loaded.add(match[1]);
      return null;
    },
    buildEnd() {
      writeFileSync(outFile, JSON.stringify([...loaded].sort(), null, 2));
    },
  };
}
