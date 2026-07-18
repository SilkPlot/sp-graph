<!-- markdownlint-disable MD013 -->
# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `0.1.x` (`main`) | yes — fixes land on `main` |
| anything else | does not exist |

There is only one line to support. SilkPlot is at `0.1.0`, **nothing has been published
to npm**, and there are no tags, no branches, and no older releases to backport to. If you
are running SilkPlot you are running a clone of `main`, so a fix is a pull, not an upgrade
path. When packages are published this table will gain a real answer about which minor
versions get patches; until then, saying "we support 0.x" would be dressing a single
moving branch up as a support commitment.

## Reporting a vulnerability

**Report privately, through GitHub's private security advisories:**

<https://github.com/SilkPlot/sp-graph/security/advisories/new>

That form is private between you and the maintainers, gives us a place to work on a fix
with you before anything is public, and lets us credit you in the published advisory.

**Do not open a public issue for a vulnerability.** The repository is public and the
issue tracker is public, so a filed issue is disclosure, and it is disclosure at the
moment there is no fix available. If you have already opened one by mistake, file the
advisory as well and say so there — we would rather have the duplicate than lose the
report.

There is no security email address. This project deliberately does not publish one:
a mailbox nobody has committed to watching is worse than no mailbox, because it looks
like a channel. The advisory form notifies the maintainers directly and is the only
channel.

Useful things to include, in rough order of how much they help:

- A minimal reproduction — the smallest chart, props, or data that shows the problem.
- Which package (`@silkplot/core`, `solid`, `charts`, `calendar`, `theme`) and which
  commit.
- What an attacker controls in your scenario: the data, a prop value, a theme token, a
  dependency.
- The impact you believe it has, and how confident you are. A report that says "I think
  this is exploitable but I could not get past a warning" is still worth filing.

## What to expect

This is an alpha maintained by a very small team, and the honest version of a response
policy is: **best effort, no service-level guarantee.** We are not going to print a
24-hour acknowledgement target we cannot keep.

What we will actually do:

- **Acknowledge** that we have read the report, and say whether we think it is a
  vulnerability. Realistically within a few days; longer is possible.
- **Tell you what we decided** — accepted, not a vulnerability, or accepted but out of
  scope — with the reasoning, not just a verdict.
- **Fix accepted reports on `main`** and publish an advisory crediting you, unless you
  ask us not to be credited.
- **Tell you if it is going to be slow.** A stalled report with no explanation is the
  failure mode worth avoiding, and it is the one we will try hardest to avoid.

If you have heard nothing in two weeks, comment on the advisory thread. That is a
reasonable prompt, not a nuisance.

Please give us a chance to fix an accepted report before disclosing publicly. We are not
going to name a fixed embargo window we might not meet — if the fix is taking longer than
you think is reasonable, say so on the thread and we will agree a date rather than let it
drift.

## Scope

SilkPlot is a client-side rendering library. It has no server, no network calls, no
storage, and no authentication surface, which narrows what a vulnerability in it can even
be. Roughly:

### In scope

- **Injection through the public API.** Chart props reaching the DOM in a way that
  executes script or escapes the intended markup — a `title`, `desc`, `summary`, table
  caption, `pointLabel` return, or any value that ends up in an SVG `<title>`/`<desc>`,
  an attribute, or a style.
- **Prototype pollution.** Anything in `@silkplot/core`'s option merging, model
  construction, or data handling that lets an attacker-controlled key write to
  `Object.prototype` or a shared prototype.
- **Theme and token injection.** A `@silkplot/theme` value that breaks out of a CSS
  custom property into a wider declaration, or a `data-sp-theme` path that lets attacker
  input write arbitrary CSS.
- **Supply chain.** A compromised or malicious dependency in this repository's tree,
  a build or release script that could execute untrusted content, or a workflow
  permission that is wider than the job needs. `npm run audit:prod` gates CI against
  production advisories; a finding that gate misses is in scope.
- **Denial of service that is disproportionate and reachable from data** — a
  pathological input (an unusual date, a degenerate extent, a very small set of points)
  that hangs or exhausts memory rather than rendering an empty or ugly chart. Ordinary
  "this is slow with a million points" is a performance issue, not a security one; file
  it as a bug.

### Out of scope

- **A vulnerability in your own application.** If your app passes unsanitised user
  content into a chart prop and that is the whole finding, the defect is at your
  boundary. It becomes in scope if SilkPlot mishandles a value your framework would
  otherwise have escaped safely — that distinction is the interesting part, so make it
  explicitly in the report.
- **Findings against an old clone.** Reproduce on current `main`.
- **Advisories in development-only dependencies** that no installed package can reach.
  CI reports these every run and does not block on them; the current one is an esbuild
  dev-server advisory. If you can show a path from a dev advisory to something a
  consumer ships, that is in scope and we want it.
- **Accessibility defects.** Real, wanted, and tracked — but as ordinary issues. See
  [`docs/accessibility.md`](docs/accessibility.md), which states plainly that **no
  assistive technology has been tested against this library**. That is a documented
  limitation, not an undisclosed one.
- **Missing hardening headers, no CSP, no SRI** on the playground. It is a development
  artifact that runs on a contributor's own machine and is not deployed anywhere.

  The **documentation site is different** and is deliberately listed here rather than
  quietly covered by the line above: it is deployed, it is public, and it is served over
  HTTPS. It is also entirely static — no server, no forms, no cookies, no storage, no
  third-party scripts, and no user input of any kind — so a missing header on it changes
  the risk to a reader by very little. Report one anyway if you can show what it actually
  enables; "a scanner flagged a missing header" on a static page with nothing to steal is
  the report we cannot act on.
- **Reports generated by a scanner with no reproduction.** A tool's output pasted in,
  with nothing showing the issue is reachable through SilkPlot's API, is not something we
  can act on.

## Safe harbour

Testing SilkPlot against your own installation, your own clone, or the playground running
on your own machine is welcome and we will not pursue you for it. There is no SilkPlot
service to test against — do not attack infrastructure you do not own on this project's
behalf.
