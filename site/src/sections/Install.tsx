import { Show, type Component } from "solid-js";
import { CodeBlock } from "../components/CodeBlock";
import { DataTable } from "../components/DataTable";
import { ON_REGISTRY, PACKAGES, REPO_URL } from "../content";

// `@next` on every package, not a bare install. The alpha is published under
// the `next` dist-tag, and a reader who copies a bare `npm install` today gets
// the same thing only because npm assigned `latest` to the first-ever publish —
// which stops being true the moment a stable version exists. The explicit tag is
// correct now and stays correct then.
const INSTALL_REGISTRY =
  "npm install @silkplot/charts@next @silkplot/solid@next @silkplot/core@next @silkplot/theme@next solid-js@1.9.20";

const INSTALL_TARBALL = `# Not on the public registry yet. Build the packages and install
# the tarballs the release gate produces:
git clone ${REPO_URL}.git
cd sp-graph && npm ci && npm run build:dist
npm pack --workspace @silkplot/core --workspace @silkplot/theme \\
         --workspace @silkplot/solid --workspace @silkplot/charts

# then, in your app:
npm install /path/to/silkplot-core-0.1.0.tgz /path/to/silkplot-theme-0.1.0.tgz \\
            /path/to/silkplot-solid-0.1.0.tgz /path/to/silkplot-charts-0.1.0.tgz`;

const INSTALL_SOLID_2 = `# Copy all four tarballs from the source checkout into ./tarballs first.
npm install --save-exact solid-js@2.0.3 @solidjs/web@2.0.3 ./tarballs/silkplot-*.tgz
npm install --save-dev --save-exact vite@8.3.0 @solidjs/vite-plugin@3.0.1`;

export const Install: Component = () => (
  <section id="install" aria-labelledby="install-h">
    <h2 id="install-h">Install</h2>

    <Show
      when={ON_REGISTRY}
      fallback={
        <>
          <p class="callout callout--warn">
            <strong>Not on the public registry yet.</strong> The packages build,
            pack, and install cleanly — a gate in CI proves exactly that by
            installing the packed tarballs into a project outside this
            repository — but nothing has been published. Until it is, install
            from a tarball you build yourself.
          </p>
          <CodeBlock code={INSTALL_TARBALL} label="Install from source" lang="bash" />
        </>
      }
    >
      <CodeBlock code={INSTALL_REGISTRY} label="Install published alpha (Solid 1)" lang="bash" />
      <p class="note">
        The registry alpha uses Solid 1. The Solid 2 example below is for the
        coordinated packages built from the source checkout.
      </p>
    </Show>

    <CodeBlock code={INSTALL_SOLID_2} label="Install Solid 2 source tarballs" lang="bash" />
    <p class="note">
      Use <code>@solidjs/vite-plugin</code> in <code>vite.config.ts</code> and
      set <code>jsxImportSource</code> to <code>@solidjs/web</code>.
    </p>

    <h3>Packages</h3>
    <DataTable
      label="Package status table"
      columns={["Package", "What it is", "Status", "Notes"]}
      rows={PACKAGES}
      cells={(p) => [
        <code>{p.name}</code>,
        p.purpose,
        <span class={`pill pill--${p.status.toLowerCase()}`}>{p.status}</span>,
        p.note,
      ]}
    />
  </section>
);
