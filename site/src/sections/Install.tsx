import { Show, type Component } from "solid-js";
import { CodeBlock } from "../components/CodeBlock";
import { DataTable } from "../components/DataTable";
import { ON_REGISTRY, PACKAGES, REPO_URL } from "../content";

const INSTALL_REGISTRY =
  "npm install @silkplot/charts @silkplot/solid @silkplot/core @silkplot/theme solid-js";

const INSTALL_TARBALL = `# Not on the public registry yet. Build the packages and install
# the tarballs the release gate produces:
git clone ${REPO_URL}.git
cd sp-graph && npm ci && npm run build:dist
npm pack --workspace @silkplot/core --workspace @silkplot/theme \\
         --workspace @silkplot/solid --workspace @silkplot/charts

# then, in your app:
npm install /path/to/silkplot-core-0.1.0.tgz /path/to/silkplot-theme-0.1.0.tgz \\
            /path/to/silkplot-solid-0.1.0.tgz /path/to/silkplot-charts-0.1.0.tgz`;

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
      <CodeBlock code={INSTALL_REGISTRY} label="Install" lang="bash" />
    </Show>

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
