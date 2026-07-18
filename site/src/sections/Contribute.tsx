import type { Component } from "solid-js";
import { REPO_URL, repoFile } from "../content";

export const Contribute: Component = () => (
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
);
