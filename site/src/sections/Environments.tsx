import type { Component } from "solid-js";
import { DataTable } from "../components/DataTable";
import { ENVIRONMENTS } from "../content";

export const Environments: Component = () => (
  <section id="environments" aria-labelledby="environments-h">
    <h2 id="environments-h">Supported environments</h2>
    <DataTable
      label="Supported environments table"
      columns={["What", "Requirement", "Why"]}
      rows={ENVIRONMENTS}
      cells={(e) => [e.what, <code>{e.requirement}</code>, e.why]}
    />
  </section>
);
