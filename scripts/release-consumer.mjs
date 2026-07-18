#!/usr/bin/env node
/**
 * The consumer half of the release gate: prove the packages work after the
 * workspace disappears.
 *
 * This is the part that cannot be faked from inside the repository. Within the
 * workspace npm links `@silkplot/*` to the packages next door and TypeScript
 * resolves them through the "source" condition, so a consumer test that lives
 * here proves nothing at all — it would pass against manifests that could not be
 * installed anywhere. So the fixture is created OUTSIDE the repository, with:
 *
 *   - no `file:` link to the source tree and no path escaping the fixture: the
 *     tarballs are COPIED in and installed from beside the manifest, and the
 *     gate asserts afterwards that nothing under `node_modules/@silkplot` is a
 *     symlink or resolves back into the repo;
 *   - no workspace to fall back on, so `@silkplot/charts`'s internal dependency
 *     on `@silkplot/core@0.1.0` has to be satisfied by the tarballs being
 *     installed alongside it. That is what makes ADR-0006's exact-version pin
 *     testable: a mismatched pin sends npm to a registry where nothing is
 *     published, and the install fails outright.
 *
 * Both supported resolution paths run end to end — install, typecheck, Vite
 * production build, and a real browser driving the built output.
 */

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

/**
 * The LineChart's series mark, as distinct from the axis domain lines.
 *
 * `stroke-linecap="round"` is on the mark and on neither axis. Selecting on
 * `path[stroke]` instead picks up the y-axis domain — the first `<path>` in the
 * document — whose `d` is a perfectly valid `M0,0V288` that passes any check for
 * "a path with geometry" while the series is absent.
 */
const SERIES_MARK = '[stroke-linecap="round"]';

/** Enough of a static server to load a Vite build. */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const serve = (root) =>
  new Promise((ready) => {
    const server = createServer((request, response) => {
      const path = decodeURIComponent((request.url ?? "/").split("?")[0]);
      const file = join(root, path === "/" ? "/index.html" : path);
      if (!file.startsWith(root) || !existsSync(file) || lstatSync(file).isDirectory()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(response);
    });
    server.listen(0, "127.0.0.1", () => ready({ server, port: server.address().port }));
  });

/**
 * The two resolution paths, and what each one must be observed to have loaded.
 *
 * `expectLoaded` / `rejectLoaded` are matched against the files the build
 * actually loaded from `node_modules/@silkplot/*`, reported by the fixture's own
 * Vite plugin. Both builds succeed either way; only this distinguishes them.
 */
const PATHS = [
  {
    id: "solid",
    title: "Solid-aware consumer — the \"solid\" condition serves TSX source",
    page: "solid.html",
    // Both JSX-bearing packages, not just the one imported directly: `charts`
    // reaching `solid`'s source is what proves the condition survives a hop.
    expectLoaded: [/^@silkplot\/charts\/src\/index\.tsx$/, /^@silkplot\/solid\/src\/index\.tsx$/],
    // Scoped to the packages that DECLARE a "solid" condition. `core` and `theme`
    // have no JSX and declare none, so a Solid-aware bundler correctly takes
    // their "default" branch and gets the compiled bundle — same as anyone else.
    // Rejecting dist for those two would assert a condition they do not have.
    rejectLoaded: /^@silkplot\/(solid|charts)\/dist\//,
    rejectWhy:
      "a Solid-aware bundler loaded compiled output from a package whose \"solid\" condition\n" +
      "      must serve source, or every consumer is locked to this build's JSX target — ADR-0006.",
    // `--listFiles` is how the typecheck reports which files it read. A tsconfig
    // says what was intended; this says what happened.
    expectTyped: [/node_modules\/@silkplot\/charts\/src\/index\.tsx$/],
    rejectTyped: /node_modules\/@silkplot\/(solid|charts)\/dist\/.*\.d\.ts$/,
  },
  {
    id: "default",
    title: "Solid-blind consumer — the \"default\" condition serves the compiled bundle",
    page: "default.html",
    expectLoaded: [/^@silkplot\/charts\/dist\/index\.js$/, /^@silkplot\/solid\/dist\/index\.js$/],
    // No package may serve source here: nothing offers the "solid" condition, so
    // any `src/` hit means an exports map is pointing a plain consumer at TSX.
    rejectLoaded: /^@silkplot\/[^/]+\/src\//,
    rejectWhy:
      "a bundler with no Solid plugin loaded TypeScript source. It cannot parse TSX, so this\n" +
      "      is the resolution that breaks a plain consumer's build.",
    expectTyped: [/node_modules\/@silkplot\/charts\/dist\/index\.d\.ts$/],
    rejectTyped: /node_modules\/@silkplot\/[^/]+\/src\//,
  },
];

export async function verifyConsumer({ repoRoot, tarballs, packageNames, keepFixture = false }) {
  const failures = [];
  const fail = (message) => failures.push(message);

  // Outside the workspace, and asserted to be — a fixture that drifted inside it
  // would pass through workspace linking while reporting that it had not.
  const base = process.env.SILKPLOT_RELEASE_TMP ?? tmpdir();
  const fixture = mkdtempSync(join(base, "silkplot-release-consumer-"));
  const realFixture = realpathSync(fixture);
  const realRepo = realpathSync(repoRoot);
  if (realFixture.startsWith(`${realRepo}/`)) {
    return [
      `the consumer fixture was created at ${realFixture}, inside the repository at ${realRepo}.\n` +
        "      Inside the workspace npm resolves @silkplot/* through workspace linking and the\n" +
        "      fixture proves nothing. Set SILKPLOT_RELEASE_TMP to a directory outside the repo.",
    ];
  }

  const npm = (args, options = {}) =>
    execFileSync("npm", args, { cwd: fixture, encoding: "utf8", stdio: "pipe", ...options });

  try {
    console.log(`\n── Consumer fixture: ${realFixture}`);

    cpSync(join(repoRoot, "test", "release-consumer"), fixture, { recursive: true });
    for (const tarball of tarballs) cpSync(tarball, join(fixture, basename(tarball)));

    // The published quickstart, typechecked against the packed tarballs.
    //
    // The site tells a newcomer this is the code that works. Nothing proved it:
    // the site compiles inside the workspace, where `@silkplot/*` resolves
    // through the "source" condition to the packages next door, so the
    // quickstart would compile unchanged even if the tarball shipped no
    // declarations at all. Copying the real file — never a transcription of it —
    // into the fixture puts the documented code through the same resolution a
    // reader who installed the package gets.
    //
    // A missing source file fails HERE rather than silently reducing the
    // fixture's coverage, because a typecheck of a file that does not exist is
    // a typecheck that passes.
    const quickstart = join(repoRoot, "site", "src", "quickstart", "app.tsx");
    if (!existsSync(quickstart)) {
      return [
        `the published quickstart is missing at ${quickstart}.\n` +
          "      The release gate typechecks it against the packed tarballs; without the file\n" +
          "      that check silently passes and the documented code is proven by nothing.",
      ];
    }
    cpSync(quickstart, join(fixture, "src", "quickstart.tsx"));

    // One install, all four tarballs at once. Sequential installs would each hit
    // a registry for the internal @silkplot/* dependencies of the one before.
    console.log("   installing packed tarballs...");
    npm([
      "install",
      "--no-audit",
      "--no-fund",
      "--loglevel", "error",
      ...tarballs.map((t) => `./${basename(t)}`),
    ], { stdio: "inherit" });

    // ---- the dependency graph is the tarballs, and nothing but the tarballs ----

    const installed = JSON.parse(readFileSync(join(fixture, "package.json"), "utf8"));
    for (const name of packageNames) {
      const range = installed.dependencies?.[name];
      if (range === undefined) {
        fail(`${name} is not in the fixture's dependencies after install`);
        continue;
      }
      // `file:` here refers to a tarball sitting beside the manifest, which is
      // the artifact under test. What must not appear is a path that climbs out
      // of the fixture — that would be a link to the source tree.
      if (/(^|[^a-z])\.\.\//.test(range) || range.includes(realRepo)) {
        fail(
          `${name} resolves to "${range}", which points outside the fixture.\n` +
            "      A dependency on the source repository is exactly what this fixture must not have.",
        );
      }
      const dir = join(fixture, "node_modules", name);
      if (!existsSync(dir)) {
        fail(`${name} was not installed into the fixture's node_modules`);
        continue;
      }
      if (lstatSync(dir).isSymbolicLink()) {
        fail(
          `node_modules/${name} is a SYMLINK, not an unpacked tarball.\n` +
            "      npm linked it to something instead of installing it; whatever this test proved,\n" +
            "      it did not prove the tarball works.",
        );
      }
      // The installed copy must be the packed one: `dist` present, `test` absent.
      if (!existsSync(join(dir, "dist", "index.js"))) {
        fail(`node_modules/${name} has no dist/index.js`);
      }
      if (existsSync(join(dir, "test"))) {
        fail(`node_modules/${name} contains a test/ directory — it was not installed from the tarball`);
      }
    }

    // ---- both paths: typecheck, build, smoke ----

    for (const path of PATHS) {
      console.log(`\n── ${path.title}`);

      // Typecheck. `--listFiles` names every file the compiler read, so the
      // assertion is on the resolution that happened rather than on the config
      // that asked for it.
      let listed = "";
      try {
        listed = npm(["run", "--silent", `typecheck:${path.id}`]);
        console.log(`   ✓ typecheck (${listed.split("\n").filter(Boolean).length} files)`);
      } catch (error) {
        fail(
          `[${path.id}] typecheck failed:\n${indent(error.stdout ?? "")}${indent(error.stderr ?? "")}`,
        );
        continue;
      }
      const typedFiles = listed.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const expected of path.expectTyped) {
        if (typedFiles.some((f) => expected.test(f))) continue;
        fail(
          `[${path.id}] typecheck never read a file matching ${expected}.\n` +
            `      It resolved @silkplot/* to: ${typedFiles.filter((f) => f.includes("@silkplot")).join(", ") || "nothing"}`,
        );
      }
      for (const file of typedFiles.filter((f) => path.rejectTyped.test(f))) {
        fail(`[${path.id}] typecheck read ${file}, which this path must not resolve.\n      ${path.rejectWhy}`);
      }

      // Production build.
      try {
        npm(["run", "--silent", `build:${path.id}`], { stdio: "inherit" });
        console.log(`   ✓ vite production build`);
      } catch (error) {
        fail(`[${path.id}] vite build failed:\n${indent(error.stdout ?? "")}${indent(error.stderr ?? "")}`);
        continue;
      }

      // What the build actually loaded.
      const recorded = JSON.parse(readFileSync(join(fixture, `resolution.${path.id}.json`), "utf8"));
      for (const expected of path.expectLoaded) {
        if (recorded.some((f) => expected.test(f))) continue;
        fail(
          `[${path.id}] the build loaded no file matching ${expected}.\n` +
            `      It loaded: ${recorded.join(", ") || "nothing from @silkplot/*"}`,
        );
      }
      for (const file of recorded.filter((f) => path.rejectLoaded.test(f))) {
        fail(`[${path.id}] the build loaded ${file}, which this path must not resolve.\n      ${path.rejectWhy}`);
      }
      if (failures.length === 0) {
        console.log(`   ✓ resolved ${recorded.filter((f) => /index\.(tsx?|js)$/.test(f)).join(", ")}`);
      }

      // Browser smoke over the built output.
      const smokeFailures = await smoke(join(fixture, "dist", path.id), path);
      for (const message of smokeFailures) fail(message);
      if (smokeFailures.length === 0) console.log("   ✓ browser smoke");
    }
  } finally {
    if (keepFixture) console.log(`\n   fixture kept at ${realFixture}`);
    else rmSync(fixture, { recursive: true, force: true });
  }

  return failures;
}

const indent = (text) => String(text).split("\n").map((l) => `      ${l}`).join("\n");

/**
 * Drive the built output in a real browser.
 *
 * Rendering is the easy half. The half worth having is the REPLACEMENT: a chart
 * whose JSX was compiled by a generic transform renders once, perfectly, and then
 * ignores its data forever — and is pixel-identical to a correct chart in any
 * screenshot. The only way to tell them apart is to change the data and look
 * again, so that is what this does.
 */
async function smoke(root, path) {
  const failures = [];
  const { server, port } = await serve(root);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`uncaught: ${error.message}`));

    await page.goto(`http://127.0.0.1:${port}/${path.page}`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__silkplotReady !== undefined, null, { timeout: 15_000 });

    const ready = await page.evaluate(() => globalThis.__silkplotReady);
    if (ready !== path.id) failures.push(`[${path.id}] the page reported __silkplotReady=${ready}`);

    const svg = page.locator("svg").first();
    if ((await svg.count()) === 0) {
      failures.push(`[${path.id}] no <svg> was rendered from the packed tarballs`);
      return failures;
    }

    // The accessible name proves more than the element's presence: it means the
    // semantics layer in @silkplot/solid was reached through the packed graph,
    // not just that charts' own module loaded.
    const name = await svg.getAttribute("aria-label");
    const labelledBy = await svg.getAttribute("aria-labelledby");
    if (name === null && labelledBy === null) {
      failures.push(`[${path.id}] the rendered chart has no accessible name`);
    }

    // Tick labels come from @silkplot/core's tick computation via
    // @silkplot/solid's Axis, so their presence exercises all three packages.
    const ticks = await page.locator("svg text").count();
    if (ticks === 0) failures.push(`[${path.id}] the chart rendered no axis tick labels`);

    // NOT `path[stroke]`. Both axis domain lines are stroked, fill-none paths
    // too, and the y-axis domain is the first `<path>` in document order — an
    // assertion on it reads `M0,0V288` and passes happily while the series is
    // missing entirely. `stroke-linecap="round"` is the mark's own attribute.
    const linePath = page.locator(`svg path${SERIES_MARK}`).first();
    if ((await linePath.count()) === 0) {
      failures.push(`[${path.id}] no series mark was rendered (svg path${SERIES_MARK})`);
      return failures;
    }
    const before = await linePath.getAttribute("d");
    // Five points in, so four line segments out. A single-segment `d` is an axis
    // or a collapsed chart, and both would satisfy a bare "is it non-empty" check.
    const segments = (before?.match(/L/g) ?? []).length;
    if (segments < 4) {
      failures.push(
        `[${path.id}] the series mark has ${segments} line segments, expected 4 for a 5-point series (d=${before})`,
      );
      return failures;
    }

    // Reactivity. Non-uniform replacement data, so the new path cannot coincide
    // with the old one under any domain policy.
    await page.evaluate(() => globalThis.__silkplotReplace());
    await page.waitForFunction(
      ({ previous, selector }) =>
        document.querySelector(`svg path${selector}`)?.getAttribute("d") !== previous,
      { previous: before, selector: SERIES_MARK },
      { timeout: 5_000 },
    ).catch(() => {
      failures.push(
        `[${path.id}] replacing the data did not move the line.\n` +
          `      d stayed at ${before.slice(0, 60)}…\n` +
          "      A chart that renders once and then ignores its data is the invisible failure\n" +
          "      ADR-0006 is written around: it is pixel-identical to a correct chart in a screenshot.",
      );
    });

    const extent = await page.evaluate(() => globalThis.__silkplotExtent());
    if (!Array.isArray(extent) || extent[1] !== 90) {
      failures.push(`[${path.id}] @silkplot/core's extentOf returned ${JSON.stringify(extent)}, expected a max of 90`);
    }

    if (consoleErrors.length > 0) {
      failures.push(`[${path.id}] the console reported ${consoleErrors.length} error(s):\n${indent(consoleErrors.join("\n"))}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  return failures;
}
