import { For, Show, type Component } from "solid-js";
import quickstartSource from "./quickstart/app.tsx?raw";
import { examples } from "./examples/registry";
import { ExampleCard } from "./components/ExampleCard";
import { CodeBlock } from "./components/CodeBlock";
import {
  ENVIRONMENTS,
  LIMITATIONS,
  ON_REGISTRY,
  PACKAGES,
  REPO_URL,
  repoFile,
} from "./content";

const INSTALL_REGISTRY = `npm install @silkplot/charts @silkplot/solid @silkplot/core @silkplot/theme solid-js`;

const INSTALL_TARBALL = `# Not on the public registry yet. Build the packages and install
# the tarballs the release gate produces:
git clone ${REPO_URL}.git
cd sp-graph && npm ci && npm run build:dist
npm pack --workspace @silkplot/core --workspace @silkplot/theme \\
         --workspace @silkplot/solid --workspace @silkplot/charts

# then, in your app:
npm install /path/to/silkplot-core-0.1.0.tgz /path/to/silkplot-theme-0.1.0.tgz \\
            /path/to/silkplot-solid-0.1.0.tgz /path/to/silkplot-charts-0.1.0.tgz`;

const Nav: Component = () => (
  <nav class="nav" aria-label="Sections">
    <ul>
      <li><a href="#install">Install</a></li>
      <li><a href="#quickstart">Quickstart</a></li>
      <li><a href="#examples">Examples</a></li>
      <li><a href="#accessibility">Accessibility</a></li>
      <li><a href="#environments">Environments</a></li>
      <li><a href="#limits">Alpha limits</a></li>
    </ul>
  </nav>
);

export const App: Component = () => (
  <>
    <a class="skip sp-focusable" href="#main">Skip to content</a>

    <header class="hero">
      <p class="hero__eyebrow">Alpha</p>
      <h1 class="hero__title">SilkPlot</h1>
      <p class="hero__tagline">
        Fast, fluid data visualization for <a href="https://www.solidjs.com/">Solid</a>.
        <br />
        <strong>D3 computes. Solid renders.</strong>
      </p>
      <p class="hero__body">
        D3's math modules do the arithmetic — scales, tick positions, path
        geometry, spatial indexes — inside pure functions and memos. Every
        element on screen is a Solid element, updated by Solid's fine-grained
        reactivity. No second renderer competes for ownership of the DOM, which
        is what <code>d3-selection</code>, <code>d3-transition</code>, and{" "}
        <code>d3-axis</code> would be; they are banned from the render path.
      </p>
      <p class="hero__links">
        <a class="button sp-focusable" href="#quickstart">Get started</a>
        <a class="button button--ghost sp-focusable" href={REPO_URL}>Source on GitHub</a>
      </p>
    </header>

    <Nav />

    <main id="main">
      <section id="install" aria-labelledby="install-h">
        <h2 id="install-h">Install</h2>

        <Show
          when={ON_REGISTRY}
          fallback={
            <>
              <p class="callout callout--warn">
                <strong>Not on the public registry yet.</strong> The packages
                build, pack, and install cleanly — a gate in CI proves exactly
                that by installing the packed tarballs into a project outside
                this repository — but nothing has been published. Until it is,
                install from a tarball you build yourself.
              </p>
              <CodeBlock code={INSTALL_TARBALL} label="Install from source" lang="bash" />
            </>
          }
        >
          <CodeBlock code={INSTALL_REGISTRY} label="Install" lang="bash" />
        </Show>

        <h3>Packages</h3>
        <section class="table-scroll" tabindex="0" aria-label="Package status table">
          <table>
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">What it is</th>
                <th scope="col">Status</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <For each={PACKAGES}>
                {(p) => (
                  <tr>
                    <th scope="row"><code>{p.name}</code></th>
                    <td>{p.purpose}</td>
                    <td>
                      <span class={`pill pill--${p.status.toLowerCase()}`}>{p.status}</span>
                    </td>
                    <td>{p.note}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </section>
      </section>

      <section id="quickstart" aria-labelledby="quickstart-h">
        <h2 id="quickstart-h">Five-minute quickstart</h2>
        <p>
          Three steps: inject the tokens, bring your data, render a chart. This
          listing is not a transcription — it is the exact contents of a file in
          this site's own source, typechecked against the public exports on every
          CI run. If it ever stopped compiling, the build would go red before it
          could mislead you.
        </p>
        <CodeBlock code={quickstartSource} label="src/main.tsx" />
        <p class="note">
          <code>title</code> is not optional on an informative chart. The props
          are a discriminated union in which an unnamed informative chart is not
          representable, so leaving it out is a compile error rather than a
          runtime warning that reaches production.
        </p>
      </section>

      <section id="examples" aria-labelledby="examples-h">
        <h2 id="examples-h">Examples</h2>
        <p>
          Each chart below is live, and the source under it is the file that
          rendered it — the same module, read twice, so the code you copy is the
          code you just watched run.
        </p>
        <div class="gallery">
          <For each={examples}>{(ex) => <ExampleCard example={ex} />}</For>
        </div>
      </section>

      <section id="accessibility" aria-labelledby="accessibility-h">
        <h2 id="accessibility-h">Accessibility</h2>
        <p>
          A chart is a picture of information, so the information has to exist
          somewhere a picture is not required. SilkPlot builds that in rather
          than offering it: optional accessibility ships as absent accessibility.
        </p>
        <ul class="facts">
          <li>
            <strong>Naming is enforced by the type system.</strong> Informative
            is the default and decorative is an explicit opt-out, so a chart
            cannot reach the accessibility tree unnamed.
          </li>
          <li>
            <strong>A real data table ships with every informative chart,</strong>{" "}
            derived from the same data the marks draw and related by{" "}
            <code>aria-details</code>. That is what makes hiding the axes from
            assistive technology defensible.
          </li>
          <li>
            <strong>One tab stop per chart.</strong> The container holds focus and
            references the active point with <code>aria-activedescendant</code>. Arrows, Home/End, and Page keys move within it. Pointer and keyboard
            write one shared active-datum state, so the crosshair and the
            announcement cannot disagree.
          </li>
          <li>
            <strong>Colour is never the only channel.</strong> Series carry dash
            patterns and marker shapes alongside colour, and the focus ring is a
            token-driven <code>:focus-visible</code> treatment proven on computed
            styles.
          </li>
        </ul>
        <p class="callout callout--warn">
          <strong>What is missing is corroboration, not implementation.</strong>{" "}
          No screen reader has been run against this library — no NVDA, JAWS,
          VoiceOver, Orca, Narrator, or TalkBack, not even informally. Automated
          evidence is extensive and it is not a substitute. No WCAG conformance
          is claimed at any level.
        </p>
        <p>
          The author-facing guide — what the library gives you, and what remains
          yours to supply — is{" "}
          <a href={repoFile("docs/accessibility.md")}>docs/accessibility.md</a>.
        </p>
      </section>

      <section id="environments" aria-labelledby="environments-h">
        <h2 id="environments-h">Supported environments</h2>
        <section class="table-scroll" tabindex="0" aria-label="Supported environments table">
          <table>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Requirement</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              <For each={ENVIRONMENTS}>
                {(e) => (
                  <tr>
                    <th scope="row">{e.what}</th>
                    <td><code>{e.requirement}</code></td>
                    <td>{e.why}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </section>
      </section>

      <section id="limits" aria-labelledby="limits-h">
        <h2 id="limits-h">What this alpha does not do</h2>
        <p>
          Stated plainly so you can plan around it. Nothing here is a surprise
          waiting in a support thread.
        </p>
        <dl class="limits">
          <For each={LIMITATIONS}>
            {(l) => (
              <>
                <dt>{l.headline}</dt>
                <dd>{l.detail}</dd>
              </>
            )}
          </For>
        </dl>
      </section>

      <section id="contribute" aria-labelledby="contribute-h">
        <h2 id="contribute-h">Contributing and feedback</h2>
        <ul class="facts">
          <li>
            <a href={repoFile("CONTRIBUTING.md")}>Contributing guide</a> — how the
            repository is laid out and what CI enforces.
          </li>
          <li>
            <a href={repoFile("SECURITY.md")}>Security policy</a> — report
            vulnerabilities privately, never in a public issue.
          </li>
          <li>
            <a href={`${REPO_URL}/issues/new/choose`}>Open an issue</a> — bug
            reports, accessibility findings, and integration feedback each have
            their own form.
          </li>
          <li>
            <a href={repoFile("docs/decisions")}>Decision records</a> — why the
            library is shaped the way it is.
          </li>
        </ul>
      </section>
    </main>

    <footer class="footer">
      <p>
        Apache-2.0. Copyright 2026 SilkPlot.{" "}
        <a href={repoFile("LICENSE")}>Licence</a>.
      </p>
    </footer>
  </>
);
