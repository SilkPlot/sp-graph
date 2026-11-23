import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { transform } from "@solidjs/compiler";

/** Precompile only the default browser bundles; the solid export still ships TSX. */
export const solidDomCompiler = {
  name: "silkplot-solid-dom",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
      const input = await readFile(path, "utf8");
      const { code, map } = transform(input, { filename: path, generate: "dom", sourceMap: true });
      const sourceMap = map ? `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString("base64")}` : "";
      return { contents: code + sourceMap, loader: "ts", resolveDir: dirname(path) };
    });
  },
};
