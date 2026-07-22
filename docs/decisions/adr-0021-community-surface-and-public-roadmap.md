# ADR-0021 — The community surface and the public roadmap

- **Status:** Accepted
- **Date:** 2026-07-22

## Context

This repository's change history is fully public — every pull request is
per-change, reviewed against CI, and traceable to the decision record that
motivated it — but its **direction** has been invisible. There have been no
public issues, no milestones, no roadmap file, and Discussions was deliberately
disabled: the issue-chooser configuration recorded that a contact link pointing
at a disabled feature is a 404 on a new contributor's first screen, and that
questions should route through the integration-feedback form until Discussions
was enabled "later".

The result, for a visitor deciding whether to adopt an alpha library: code
lands fully formed from nowhere, there is no way to see what is planned or
known-missing, and there is no channel named "I want X". The absence of a
request path reads as "not listening", and that is an adoption cost paid
precisely by the early adopters an alpha most needs.

The reasoning that kept the surface minimal — do it properly once there are
users — has been rejected as a class, not just in this instance. It inverts
cause and effect: the channels are part of what makes users show up, and the
cost of running them empty is near zero. Community infrastructure that is
standard across the open-source ecosystem ships from day one.

## Decision

### 1. Discussions is enabled, reversing the recorded off-decision

GitHub Discussions is on, with the standard categories. **Q&A** takes usage
questions ("is this the intended pattern?"), which previously routed through
the integration-feedback issue form; **Ideas** takes open-ended product
thoughts that are not yet a concrete request. The condition the old
issue-chooser comment set — "if Discussions is enabled later, add the link
back" — is executed in the same change: the chooser now links Discussions,
and no link on that screen points at a disabled feature.

### 2. A feature-request issue form joins the existing three

Concrete requests — a capability someone needs, described by the problem it
solves — get a structured form (`feature-request.yml`) beside bug,
accessibility, and integration feedback. The form and the Ideas category each
name the other, so the split is explicit rather than folklore: **shaped and
scoped → the form; exploratory → Ideas.** A request that ends up in the wrong
channel is moved, not rejected.

### 3. Issues are an inbound channel, not the planning board

The issue tracker exists for reports and requests **from users**. The
maintainers' own planning does not move into it, and planned work is not
pre-filed as placeholder issues. The public signal of direction is the roadmap
(§4), not the tracker. This keeps every issue a real conversation with a real
reporter, and it means an empty issue list says "nothing reported", not
"nothing planned".

### 4. One public roadmap source, everything else derived

The public roadmap is a single curated file, `ROADMAP.md`, at the repository
root (its first content lands separately from this decision). Two derived
views — and only derived views — present it elsewhere:

- the documentation site renders the file itself at build time, the same
  single-source mechanism the site already uses to keep example code and
  rendered examples from diverging;
- GitHub **milestones** mirror the file's version-line headings, so "under
  construction" has a visible shape on the repository.

No second hand-maintained copy of the roadmap may exist anywhere. A derived
view that can drift from its source eventually lies, and this project's
documentation discipline is that pages provably cannot lie.

### 5. Milestones are named for version lines

Milestones carry the published version line they track (for example
`0.3.0-next`), not theme names, so a visitor can map a milestone to the
dist-tag they would install. Issues land on a milestone when triage decides
the version line, which — per §3 — happens to inbound issues, not to
pre-filed planning.

### 6. CODEOWNERS names the maintainer of record

`.github/CODEOWNERS` routes every path to the maintainer. With this
repository's zero-approval merge policy (recorded in the branch-protection
setup: the audit trail and CI gates are mandatory, a second human is not),
CODEOWNERS is not a review gate — it is the standard, machine-readable
statement of who answers for the code, which is exactly the kind of
convention a public repository adopts because the ecosystem reads it.

## Consequences

- The issue chooser gains a Discussions contact link and its comment no longer
  documents why Discussions is off; that history lives here instead.
- The integration-feedback form narrows: usage questions now belong in Q&A
  Discussions, and the form says so. Integration friction reports stay.
- A welcome announcement in Discussions states plainly what is and is not
  ready, in the same honest register as the README and the accessibility
  guide. Overclaiming on the community surface would contradict the discipline
  every gate enforces behind it.
- The roadmap file, the site's rendering of it, and the alignment of milestone
  names to its headings are follow-on changes; this ADR fixes the mechanism so
  those changes cannot introduce a second source of truth.
- Two stale pre-publication claims found in the issue forms while executing
  this ("SilkPlot is not published to npm") are corrected in the same change —
  the packages have been on the registry since 0.2.0-next.1.
