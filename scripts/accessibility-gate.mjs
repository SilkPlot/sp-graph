/**
 * The accessibility gate.
 *
 * The deterministic accessibility checks already run inside the full suite. That
 * is not the same as being GATED: a suite-wide green says nothing about whether
 * the accessibility files were among the ones that ran, and the single easiest
 * way to make a failing accessibility check stop failing is to delete its file,
 * which a suite-wide green reports as an improvement in runtime.
 *
 * So this script names the suites explicitly and fails if any of them has gone
 * missing, been emptied, or been made unreachable by the Vitest project layout.
 * With `--run` it then executes exactly those suites, so CI has a step whose
 * pass/fail means "the accessibility contract still holds" and nothing else.
 *
 * The honest limit, stated rather than papered over: nothing here can survive
 * someone deleting the CI step AND this script. What it can do is make every
 * smaller move loud — a deleted test file, an emptied one, a renamed project, a
 * workflow that quietly stopped calling the gate. Those are the ways a gate
 * actually dies. The `.github/workflows/ci.yml` assertions below cover the last
 * of them, and removing this file outright is a diff nobody can miss.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The suites that prove ADR-0005 holds, and what each one is here to catch.
 *
 * `project` is the Vitest project the file belongs to; `browser` records whether
 * the check is only meaningful in a real browser, because that is the property
 * most likely to be "simplified" away. A focus ring is a computed style resolved
 * under `:focus-visible`, a media query, and a custom-property cascade — none of
 * which a node environment resolves at all, so a node port of one of these files
 * would pass while proving nothing.
 */
const SUITES = [
  {
    file: "packages/solid/test/semantics.test.tsx",
    project: "solid",
    browser: true,
    covers: "the name/description contract: dev throws, production degrades honestly",
  },
  {
    file: "packages/solid/test/keyboard.test.tsx",
    project: "solid",
    browser: true,
    covers: "the single-entry composite: one tab stop, arrows inside, Tab always exits",
  },
  {
    file: "packages/solid/test/announcer.test.tsx",
    project: "solid",
    browser: true,
    covers: "polite, throttled, de-duplicated announcements",
  },
  {
    file: "packages/solid/test/theme-cascade.test.tsx",
    project: "solid",
    browser: true,
    covers: "which token declaration actually wins, on computed styles",
  },
  {
    file: "packages/theme/test/contrast.test.ts",
    project: "theme",
    browser: false,
    covers: "every token pair and palette entry recomputed against its surface",
  },
  {
    file: "packages/charts/test/chart-semantics.test.tsx",
    project: "charts",
    browser: true,
    covers: "name, description, decorative mode, and the data alternative, per chart family",
  },
  {
    file: "packages/charts/test/LineChart-keyboard.test.tsx",
    project: "charts",
    browser: true,
    covers: "a composed chart is keyboard-navigable and announces its steps",
  },
  {
    file: "playground/test/focus.test.tsx",
    project: "playground",
    browser: true,
    covers: "visible focus at 3:1 across all four scheme x contrast combinations",
  },
  {
    file: "playground/test/keyboard.test.tsx",
    project: "playground",
    browser: true,
    covers: "the reference composition no longer captures the page with role=application",
  },
];

/** npm scripts the CI workflow has to keep calling for this gate to mean anything. */
const REQUIRED_CI_SCRIPTS = ["npm run gate:accessibility", "npm run test:accessibility"];

const failures = [];
const fail = (message) => failures.push(message);

function read(relative) {
  try {
    return readFileSync(join(repoRoot, relative), "utf8");
  } catch {
    return undefined;
  }
}

// 1. Every named suite exists and still asserts something.
//
// The emptiness check is not pedantry: a file stripped to its imports is the
// shape a "temporarily skipped" suite takes, and it passes a bare existence
// check and a bare test run alike.
for (const suite of SUITES) {
  const source = read(suite.file);
  if (source === undefined) {
    fail(`missing accessibility suite: ${suite.file}\n    it covered: ${suite.covers}`);
    continue;
  }
  const assertions = (source.match(/\bit\(/g) ?? []).length;
  if (assertions === 0) {
    fail(`accessibility suite asserts nothing: ${suite.file}\n    it covered: ${suite.covers}`);
  }
  const skipped = source.match(/\b(?:describe|it)\.(?:skip|todo)\(/g) ?? [];
  if (skipped.length > 0) {
    fail(
      `accessibility suite has ${skipped.length} skipped block(s): ${suite.file}\n` +
        "    a skipped accessibility check is an unmet contract, not a pending one",
    );
  }
}

// 2. Every suite is reachable by the Vitest project layout.
//
// A project renamed or dropped from vitest.config.ts leaves its test files sitting
// on disk, matched by nothing. The full suite goes green, faster than before.
const vitestConfig = read("vitest.config.ts");
if (vitestConfig === undefined) {
  fail("vitest.config.ts not found — cannot verify the accessibility suites are reachable");
} else {
  for (const project of new Set(SUITES.map((s) => s.project))) {
    if (!vitestConfig.includes(`"${project}"`)) {
      fail(`Vitest project "${project}" is not defined in vitest.config.ts`);
    }
  }
  // Anything rendering Solid, resolving a computed style, or dispatching a real
  // key press has to run in a real browser. jsdom would pass and prove nothing.
  if (!vitestConfig.includes("browser")) {
    fail("vitest.config.ts declares no browser project — the browser-only checks cannot run");
  }
}

// 3. CI still calls this gate.
const workflow = read(".github/workflows/ci.yml");
if (workflow === undefined) {
  fail(".github/workflows/ci.yml not found — the gate is not wired into CI");
} else {
  for (const script of REQUIRED_CI_SCRIPTS) {
    if (!workflow.includes(script)) {
      fail(`.github/workflows/ci.yml no longer runs \`${script}\``);
    }
  }
}

if (failures.length > 0) {
  console.error("Accessibility gate FAILED:\n");
  for (const message of failures) console.error(`  - ${message}\n`);
  console.error(
    "These suites are the evidence behind docs/accessibility.md. Removing one does not\n" +
      "make the contract hold; it makes the claim unfounded. Fix the check, or change the\n" +
      "contract in ADR-0005 first and update this manifest with it.\n",
  );
  process.exit(1);
}

console.log(`Accessibility gate: ${SUITES.length} suites present and reachable.`);

if (process.argv.includes("--run")) {
  // One Vitest process across the named files. One process is the point: two
  // concurrent runs collide on the browser API port, and the collision does not
  // report as a collision — it reports a connect timeout, executes zero tests,
  // and exits in about a second.
  const result = spawnSync(
    "npx",
    ["vitest", "run", ...SUITES.map((s) => s.file)],
    { cwd: repoRoot, stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}
