---
name: orca-project-profile
description: >-
  Read and maintain the project profile that declares a project's parameters:
  its repositories and their roles, the authority chain, durable record paths,
  planning structure, relocations, overrides, project rules and estate
  bindings. Use when resolving where a durable record lives, when a declared
  absence must be stated rather than omitted, when the profile and the live
  workspace disagree, and when a parameter has no obvious owner.
metadata:
  baselineVersion: "0.23.0"
  derivedFrom: CANON-008
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-008 in orca-baseline.
  Baseline version: 0.23.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Project Profile Contract

## 1. Location

The profile lives at `.orca/project-profile.md` in the project's **authority
repository**, defined in section 3.

One profile per project, never one per repository.

## 2. Required sections

### 2.1 Identity

- Project name.
- Profile version and last-updated date.
- Bootstrap record reference.

### 2.2 Inherited canon

The baseline version this project was bootstrapped or last updated onto, and
every canonical source it inherits, **by identifier only**.

A path is not recorded. The sources are installed capabilities carried by the
project itself, so a path here would point at the distribution and couple the
project back to it - which section 5.1 forbids and the bar in CANON-011 section 2
tests. The lockfile proves the capabilities unmodified; the version says which
baseline they came from.

Inheriting the full set is the default. A project that inherits less justifies
each exclusion as an override under section 2.8.

### 2.3 Repositories

Every repository in the project, with:

| Field | Meaning |
|-------|---------|
| `roles` | One or more of `authority`, `planning`, `docs`, `standards`, `code`, `meta`, `archive` |
| `path` | Filesystem path |
| `orca_repo_id` | Orca's registered repository identifier |
| `remote` | Canonical remote key, to distinguish same-named local checkouts |
| `base_ref` | Configured default base for new worktrees |
| `access` | `read-write` or `read-only` for the session |
| `mounted` | Whether sessions mount it by default |
| `rules` | Path to that repository's own rules, or `none` |
| `lane` | The mechanism that enforces this repository's access, or `none` |
| `visibility` | `public` or `private`. Who can read the repository, not who can write it |
| `inbound_channel` | Where **this** repository receives a report from another, or `none (searched: <path>)` |
| `entry_point` | `generated` or `none`. Whether section 5's generator writes this repository's entry point. Absent reads as `generated` |

**`entry_point: none` says a project does not generate into a repository, and it
is the only way to say it.** A project may declare a repository it does not own
the entry point of - one governed by its own authored `AGENTS.md`, one whose
visibility or licence forbids receiving generated content, one it holds read-only.
Before this field existed, section 5's generator wrote to **every** declared
repository and offered no way to express the answer, so a decision a project and
its human had already settled was enforced by prose and undone by anyone following
section 5.5's *"regenerated, never edited"*.

**Absent reads as `generated`**, which is the only compatible default: every
profile written before 2026-08-11 means it, and reading silence as `none` would
have stopped generation for all of them at once. The field is how a project says
the *unusual* thing.

**The authority repository may not declare `none`.** Where a project owns no root,
section 5.2 carries the root content in that repository's entry point, so opting
it out leaves the capability set written down nowhere. Refused rather than
warned - `decisions/0114`.

**`inbound_channel` is declared by the repository being described, and that is
the whole of it.** `gap_intake` in section 2.10 answers the opposite question -
*where do I file a finding about a knowledge source* - and is declared by the
consumer, so one fact ends up copied into every profile that needs it. Two
projects declare the same three vault paths today: one fact, two copies, no
single place to correct it.

A repository's own inbox is knowable only by that repository, changes only when
that repository moves it, and is needed by everyone else. Declaring it here
inverts the direction: **owned once, by the only party that can know it is still
true.**

**Absence is declared, never omitted, and it names where it looked** -
`none (searched: intake/gaps/)` rather than a bare `none`. Section 2.6 already
spends a bare `none` on *"this project has no such structure"*, and this field
must distinguish **no inbox exists** from **nobody checked**. Decision 0100
settled that form for a declared absence and this reuses it rather than inventing
a second one.

**Why it is a repository field and not a project one.** An inbox is a property of
a repository - it is a directory inside one - and a project with four
repositories may have four different answers or none. Section 2.10's estate
bindings are project-wide by construction, so a channel declared there could not
say which repository it belonged to. `gap-2026-08-07-org-foundry-no-field-declares-a-repositorys-own-inbound-channel`
named 2.10 because that is where the neighbouring field lives; the ruling placed
it here instead - decision 0106.

**What this does not do.** It does not create a directory, and it does not make a
repository reachable by declaring it. A profile naming an inbox that does not
exist is wrong in the same way a profile naming an absent repository is wrong,
and the same check answers both.

**`visibility` has no default and absence is refused**, the same rule `access`
carries. A profile that omits it would parse cleanly and read as though it had
declared the safe thing, and the unsafe direction here is silent: a generated
file naming a private repository is wrong the moment it is pushed, and nothing in
the project can tell afterwards.

It is a distinct fact from `access`. A repository can be world-readable and still
read-only to this session, or private and read-write; conflating the two answers
a disclosure question with a permissions answer.

`rules` carries only what is true of **that repository alone**. A rule that
applies across the project belongs in section 2.9, and a rule that varies a
canonical floor belongs in section 2.8. A repository's rules are declared here
so they are reachable by the generator in section 5 and bound by section 2.4 -
an undeclared repository-local rules file does not govern.

**Roles are multi-valued.** A repository commonly carries several: measured
across the corpus, the recurring shape is a project holding separate `planning`,
`docs` and `standards` repositories, and a repository that is `authority` is
almost always also `planning` or `docs`. A single-valued field forced one of two
true facts to be discarded.

**These are `repository roles`**, and the qualifier is not decoration. Three
different things in this estate are called a role: a **repository role** here, an
**execution role** under CANON-010, and an **occupational role** in the estate
index. They are unrelated, and `role` unqualified has been read as all three.
Write the qualifier every time.

**Repository roles are defined, not descriptive.** A repository carries one
because of what it holds, and holding the wrong thing is a defect to be corrected
rather than a shape to be accommodated.

| Role | Holds |
|------|-------|
| `authority` | The profile and the durable records. Exactly one repository |
| `planning` | **Living documents.** The handoff, next-session prompt, backlog, sprints, phases, tasks, decisions in flight, current status |
| `docs` | **Static documents.** Architecture, conventions, references, design records - things that describe how the project is built rather than what it is doing now |
| `standards` | Normative rules the project applies to itself |
| `code` | Implementation |
| `meta` | A workspace root or thin map that tracks no program content |
| `archive` | Retained for history, never written to. A session does not treat its contents as current |

The line between `planning` and `docs` is **living versus static**, and it is the
one most often drawn wrongly. A handoff, a status claim or a backlog in a `docs`
repository is misplaced: it changes every session while everything around it
changes rarely, so it goes stale inside a body of documents nobody expects to
move.

**A misplaced record is moved, not declared around.** The bootstrap relocates it
to the repository whose role owns it and records the move under section 2.7. A
profile that points at a living document sitting in a static repository has
described a defect accurately and left it in place.

This does not apply to a single-repository project, where one repository
necessarily holds every role.

Exactly one repository carries `authority` among its roles. A single-repository
project declares that repository as `authority` plus whatever else applies.

**A declared access mode is trusted unless something enforces it.** `lane` names
whatever mechanism enforces a repository's access, and is `none` when nothing
does. It is deliberately not tied to any particular mechanism: naming one in this
field's definition is what made the previous version of this passage wrong.

**A lane CAN reach `eliminated`, and this document said twice that it could not.**
The corrections are recorded rather than swept, because each was true of what its
author searched:

- The `environmentRecipes` schema is `id`, `name`, `create`, `suspend`, `resume`
  and `destroy`. It has no mount field, no access field and no `:ro` field, so a
  recipe cannot express a mount. That sentence is accurate and stays withdrawn as
  a capability claim in CANON-007 section 16.1.
- **The conclusion drawn from it was not.** A recipe's `create` runs a script, and
  the script does the work. The recipe is the invocation hook, not the
  expression - so the schema's silence bounds what a recipe *says*, never what it
  *starts*.

`orca-workspace-isolation`, a ProbablyComputers repository at `2.0.0`, mounts a
declared set of repositories per workspace, each `writable` or `read-only`, and a
read-only member is mounted `:ro`. Decision 0066's 2026-08-02 amendment recorded
this and **this document was not updated with it**; decision 0084 does that.

**Measured first-hand on 2026-08-03, both directions:**

| Mount | Result |
|---|---|
| writable, as the control | the write succeeds and the host file changes |
| **read-only, running as `root` inside the container** | `Read-only file system`; the host file is unchanged |

The control case is half the evidence: it proves the refusal is a refusal rather
than a test that cannot fail. `build/gate.mjs` runs both.

**So `none` in this field now means unconfigured, not unavailable** - the
opposite of what this passage said, and the distinction that matters to a reader
deciding whether to bother. Filesystem permissions still do not bind a same-uid
actor, and a commit hook still gates a commit rather than a write; those routes
remain dead and the container route does not.

Declaring remains mandatory either way. An enforcing mechanism is invisible to a
session reading the profile, and section 2.4's rule is that what governs must be
declared. The two are not alternatives: the profile declares the lane so it can
be read, and the mechanism - where one exists - enforces it so it cannot be
exceeded.

**Where both exist they must agree.** A profile granting write access that the
lane refuses will fail at the first write, having told the session it could
proceed. A profile granting less than the lane permits is a quieter defect and
still a defect: the session is working to a boundary nobody declared.

**A worktree of an already-declared repository is declared as its own row**,
naming the repository it belongs to:

| Field | Meaning |
|-------|---------|
| `worktree_of` | The declared repository this is a worktree of, or `none` |

Both shapes occur and both must be declarable: a worktree directory inside the
project root, and a sibling directory beside it. A worktree that is not declared
is invisible to the profile while being fully writable, which is the condition
CANON-006 section 3 exists to prevent.

**A worktree is declared where the project intends it to persist. A
runtime-created worktree is not declared, and is covered by CANON-011 section 3.1's
inspection obligation instead.** The axis is **lifetime**, not location, and the
two shapes named above are both about location - which is why this rule read as
unconditional and could not be satisfied.

Declaring a worktree the runtime removes at closeout produces a profile that is
false the moment it reaches the default branch, and section 4 requires every
declared path to resolve. **Both readings breached a rule**, and a bootstrap
necessarily meets this: the profile does not exist yet, so it is authored from
inside exactly such a worktree. Reported by ORKS 2026-08-11 as a live
contradiction rather than a hypothetical, and ruled by `decisions/0114`.

The rationale is unchanged and is what decides the split. A declaration exists so
that a writable checkout is not invisible to the profile; **a transient worktree
is made visible by inspection at the time, which CANON-011 section 3.1 already
requires over every worktree of every repository.** A profile row is a poor
instrument for a directory whose lifetime is shorter than the profile's.

**What the project root is, and whether this project owns one.**

The project root is the directory the declared repositories sit under, and every
`path` above resolves against it. For a single-repository project it is the
repository itself - root and repository are one directory. **That is what `path`
resolves against**, which this document did not say and `lessons/0066` carries
open on that account.

A project does not necessarily **own** that directory. Two of the layouts in
evidence are repositories that are siblings inside a shared organisation
directory - one holding thirty-odd unrelated repositories, one a mirror of a
private organisation that no remote owns and that would not exist in a fresh
clone. Such a directory is not a working tree, so it can hold no tracked file at
all, and CANON-005 section 5 forbids resting durable state on untracked storage.

| Field | Meaning |
|-------|---------|
| `project_root` | `owned` where section 5.2's root content is written **at the project root**, or `authority` where it is carried by the authority repository's entry point instead |

**This definition contradicted the third rule below it until 2026-08-11, and the
correction is recorded rather than swept**, because a reader who followed the
definition and a reader who followed the rule reached opposite answers about the
same project. The definition read *"`owned` where the project root is a tracked
directory of this project, or `authority` where it is **not**"* - which makes
`authority` false by definition for any tracked root. The third rule says that
where the root is a working tree and the project declares more than one
repository, **both values are possible** and the profile must choose. A tracked
root with eight repositories satisfies the rule's antecedent and the definition's
exclusion at once.

**The rule is what `rootOwnership()` implements**, and it is the one that
survives: it refuses `owned` for an untracked root and never refuses `authority`
for a tracked one. So the definition was the wrong half, and it was wrong in the
direction that matters - it described the field as a **measurement** of the
filesystem when it is a **declaration** of where the content goes. Tracked-ness
constrains which values are available; it does not select one. Reported by
`datacentricus`, whose profile is the first in the corpus to have a tracked root
that is also a declared repository.

Declared once for the project, beneath the table above:

```
- project_root: authority (nine siblings in an organisation mirror; nothing tracks it)
```

Rules, and the third is the one that keeps this from becoming a waiver:

- **A single-repository project is `owned`.** Its root is its repository, which
  is tracked by definition. `authority` is refused there, because the root entry
  point is genuinely written at the root and saying otherwise describes a
  different artifact.
- **A declaration the filesystem contradicts is refused, not corrected.**
  `owned` for a root that is no working tree names a file the project cannot
  track. This is section 2.3's rule for `lane` in another field: where both a
  declaration and the world exist, they must agree.
- **Absence is refused wherever it would be a choice.** Where the project root is
  a working tree and the project declares more than one repository, both values
  are possible, nothing can measure which, and a silent default would decide it
  for the profile - so the profile is refused, exactly as it is for `visibility`
  and `access`. Where the root is **not** a working tree, `owned` is not an
  available value: nothing is being chosen, the measured answer stands, and the
  generator prints it rather than applying it silently.

**This is not an exemption from section 5.** Section 5's obligation is that the
content exists and is reachable, and section 5.2 says where it lives in each
case. A project with no owned root carries every artifact section 5 names; none
of them is outside a declared repository.

### 2.4 Authority chain

Every governing document a session must read, listed explicitly and in
precedence order.

This parameter exists because **a session does not reliably run inside the
repository's canonical location**. Orca creates worktrees outside it, so a
governing document sitting above the repository on disk is unreachable by any
instruction to walk parent directories. The chain must be declared, not derived.

| Field | Meaning |
|-------|---------|
| `order` | Precedence position; lower binds first where two documents conflict |
| `repo` | Which declared repository holds it |
| `path` | Path within that repository |
| `owns` | The concern it governs, in a few words |

Rules:

- Every governing document is listed, including any held by a repository other
  than the authority repository.
- **A document not listed does not govern.** Discovering an unlisted governing
  document is a profile defect to be reported, not silently absorbed.
- Two documents may not claim the same concern. Where one document defers to
  another, only the document that actually owns the concern may claim it. A
  duplicated claim is resolved under CANON-001 before the profile is valid.
- The chain is validated by resolution, per section 4.

**Path resolution.** A chain entry resolves against the session's own checkout
of the named repository, not against that repository's canonical location. A
session working in a worktree therefore reads the governing documents as they
exist on the branch it is changing, so governance travels with the work rather
than lagging behind on the default branch.

Two consequences follow, and a profile must honour both:

- An entry that must instead be read from the canonical checkout - because it
  governs the estate rather than the branch - says so explicitly on that entry.
- **Where the runtime reads a file from the primary checkout, the runtime wins.**
  Orca reads its repository configuration from the primary checkout, not from the
  worktree a session runs in. A profile that declares such a file as
  branch-local is stating something the runtime will not honour, and the session
  will act on a value it never read. Declare those entries as canonical-checkout
  entries. Canon does not get to legislate a runtime behaviour it does not
  control - CANON-002 section 2.
- The profile itself is subject to this rule, so it is only discoverable once it
  exists on the branch a session starts from. A profile that has never been
  committed to the authority repository's default branch does not yet satisfy
  section 4, however complete its contents.

### 2.5 Durable record paths

Where each obligation in CANON-006 is satisfied in this project:

| Parameter | Points at |
|-----------|-----------|
| `handoff` | Current session handoff |
| `next_session` | Open next-session prompt |
| `work_contract` | Backlog, briefs or task index |
| `decisions` | Accepted decision records |
| `lessons` | Lessons record |
| `closeout_rules` | Project closeout procedure, if it has one beyond CANON-006 |
| `validators` | Commands that must pass before handoff |

A parameter with no project artifact is declared `none` explicitly. Silence is
not permitted - an absent parameter must be visibly absent.

### 2.6 Planning structure

Parameters for CANON-003: where sprints, phases and tasks live, and the naming
convention for lessons and blocker records. Declared `none` if the project does
not use the planning model.

**A declared absence may name where it was looked for**, and where it does, the
checker looks there too:

```
| phases | none (searched: delivery/) |
```

**Why this is offered rather than required.** `build/profile-check.mjs` searches
the **directory** shape — a directory named for the parameter, holding entries.
It cannot search the **heading** shape, because deciding whether `## The task` in
a document is a task hierarchy or a sentence answers wrong in both directions,
and a false positive teaches people to ignore the check.

**The bootstrapper knows which shape its project uses and the checker cannot.**
So a project recording planning as headings inside documents names the documents,
and `checkDeclaredAbsences()` greps them for a heading matching the parameter.
An unqualified `none` stays valid and is searched for the directory shape only —
which is what every profile written before 2026-08-05 declares, and breaking them
to buy a check is not a trade this contract makes.

**This is `lessons/0087`'s repair.** Consumer `gir-42` declared four absences and
all four were false; three were headings inside `delivery/` and invisible to any
directory search. The qualifier is the smallest thing that would have caught
them, and it is the reporter who supplies the knowledge the checker lacks.

### 2.7 Superseded local process

Every pre-existing management, startup or session process that the bootstrap
retired, with:

- what it was and where it lived;
- which canonical source now owns that concern;
- how it was retired - superseded in place, converted to a reference, or
  archived; and
- the authorization for retiring it.

This section is what prevents a retired process from being silently
resurrected by a future session reading a stale file.

### 2.8 Overrides

Every project override, complete per CANON-001 section 3.7:

- what is being overridden;
- which canonical rule;
- why the override is necessary;
- the scope in which it applies;
- whether it is temporary or permanent;
- who or what authorized it; and
- what inherited behaviour remains unchanged.

An override may raise a canonical floor. It may not lower one. A project with
no overrides states `none`.

### 2.9 Additional project rules

Rules this project introduces that canon does not cover. These must be genuinely
project-specific; a rule that would apply to every project belongs in canon.

### 2.10 Estate bindings

Where this project's roles resolve their knowledge, and where findings about that
knowledge are filed.

| Parameter | Meaning |
|-----------|---------|
| `estate_root` | Root the knowledge sources resolve from. Declared relative to the home directory so it resolves on any machine |
| `sources` | Each knowledge source this project's roles bind to, by slug |
| `gap_intake` | Where a finding about a source is filed, per source |

Rules:

- A project with no roles declares `none` for all three.
- `gap_intake` is required for every declared source. A source with no declared
  intake cannot receive a finding, so the finding is lost and the gap persists -
  and CANON-009a routes findings there rather than permitting a local fix.
- The estate is **machine-scoped**, not project-scoped. It is declared here so it
  is visible and version-checkable, which is what CANON-007 section 1.1 requires
  of anything present in a session.
- A source that does not resolve is a stop, not a degrade. A role does not run
  without its knowledge - CANON-010 section 5.

## 3. Authority repository selection

Selected in this order, and recorded with the reason:

1. A dedicated planning repository, if exactly one exists.
2. A dedicated documentation repository, if exactly one exists.
3. A workspace-root or meta repository, if one exists and is tracked.
4. The single repository, for a single-repository project.

**Tie-break.** Where a step matches more than one repository, the step does not
resolve and selection does not silently fall through to the next. Measured in the
corpus: one project carries three separate repositories whose names all claim
planning, each a real repository with its own remote.

Resolve a tie by, in order:

1. The candidate that holds the project's durable records under section 2.5. The
   authority repository is defined by what it holds, not by what it is called.
2. Failing that, a decision from the human under CANON-004, recorded with its
   reason in section 2.2's bootstrap record.

Never by name, recency, or size. A repository named `planning` that holds no
records is a naming convention, not an authority.

The authority repository holds the profile and the durable records. It must be
tracked in version control - CANON-005 section 5 forbids resting durable state
on untracked or ignored storage.

## 4. Validity

A profile is valid only when:

- every required section is present, with `none` used rather than omission;
- every declared path resolves;
- every entry in the authority chain resolves, and no two entries claim the
  same concern;
- every declared Orca identifier resolves against the live runtime;
- every repository declaring a `lane` also declares an access mode - a lane
  enforces a declaration, it does not replace one. **Nothing validates that a
  declared lane enforces what it names**, and no check is specified here for it:
  the previous version of this clause required a lane to resolve to a recipe
  whose mounts agreed with section 2.3, which was unimplementable - recipes have
  no mounts - and was never implemented;
- exactly one repository holds `role: authority`; and
- every override is complete per section 2.8.

A session that reads an invalid profile stops and reports, per CANON-006
section 1 step 8. It does not repair the profile as a side effect of other work.

## 5. Generated agent entry points

Every project carries `AGENTS.md` at the root of every declared repository, and
at the project root where section 2.3 declares a `project_root` the project
**owns**. Where it declares `authority`, no file is written at the project root
and section 5.2's root content is carried by the authority repository's entry
point. These are **generated materializations** under CANON-001 section 3.8:
non-authoritative, derived from this profile, regenerable, and unsafe to edit.
Subdirectory-scoped files are not claimed and are not generated.

**This clause was unconditional until 2026-08-07 and two consumers could not
satisfy it.** It required an artifact at a location this document never defined,
and the projects that reached it had no such location: `ac-os`, two repositories
that are siblings under a shared organisation directory, and `gir-42`, nine
siblings in an organisation mirror. Both remedies available to them were wrong -
tracking the directory version-controls an organisation mirror and invents a
repository whose only content is the entry point demanding it exist, and waiving
the rule is a project declaring itself exempt from one with no exemption. What
was missing was **where the content goes when there is no root**, which is now
section 5.2's second case rather than a consumer's problem. Decision 0102;
`lessons/0062`, `0063`, `0066`.

### 5.1 Why they are generated rather than authored

An agent finds `AGENTS.md` by walking up from its working directory, before it
knows the profile exists. The entry point must therefore restate what the profile
owns. CANON-001 section 3.8 permits that duplication for a generated artifact and
requires it be marked as such.

Restating is not governing. Section 2.4 still decides: a document not listed in
the authority chain does not govern, whatever a generated file repeats.

This is also why the file cannot carry authored content. Anything written into it
by hand is destroyed on the next generation and fixes nothing upstream.

### 5.2 Required content

At the project root:

- Project identity.
- Where the profile is, and the authority chain in precedence order.
- The installed capability set and the baseline version.
- The generated notice required by CANON-001 section 3.8, **in a form a machine
  can read**. Section 3.8 requires the artifact be marked generated,
  non-authoritative, derived from a named source, regenerable and unsafe to edit.
  A comment states all five to a human and none of them to a tool, so a linter, an
  index or another generator cannot tell the file apart from an authored one.
  Frontmatter carries the same five facts where something can act on them.

At a repository root, additionally:

- Which repository this is, its declared roles, and its access mode.
- That repository's own rules, from its `rules` entry in section 2.3.

**Where section 2.3 declares `project_root: authority`, the authority
repository's entry point carries the list above as well as its own**, and states
that it is carrying it and why. Nothing is dropped and nothing moves to a second
place: the same block, rendered by the same producer, in the one repository the
profile already puts at the centre of the project.

Two facts in that block resolve **from the authority repository** in this case,
not from the project root, because that is where the install actually is. Reading
them from an untracked organisation directory returned nothing and stamped
`baseline_version: unknown` into all six of a consumer's entry points while its
authority repository held the answer one directory down - `lessons/0062`, and
the failure was silent because the generator was behaving exactly as written.

**A single-repository project does the mirror image of this**, and the rule was
implemented before it was written down here: the project root and the repository
root are the same directory, so the two entry points are one file, and the
repository facts are folded into the root file rather than emitted a second time.
Generating both wrote `<project>/<repository>/AGENTS.md` - a directory that
should not exist, produced by a generator following this section while it still
assumed every project has a root above its repositories.

**The fold is a property of the PATH, not of the repository count.** Where **any**
declared repository resolves to the project root - `path: .`, a tracked
directory with its own remote that the project's other repositories sit inside -
its entry point **is** the root file: emitted once, carrying both blocks, exactly
as the single-repository case. Nothing is written twice and nothing is dropped.

**Stated because the narrower reading was implemented and lost a file.** This
section spelled the fold for *a project of one repository* and said nothing about
*one repository of many*, so a generator following it emitted the root pair and
then emitted the same repository's pair at the same path. **The second write won,
and the loser was the root content**: the file that survived carried the
repository block and had no `## Installed capabilities` section at all. Nothing
in the project could correct it, because the file is generated. `datacentricus`,
eight repositories, the eighth being the directory the other seven sit in;
decision 0109.

**The generated file states the truth by construction, which is what chose this
over the alternative.** Refusing the shape and requiring `authority` was the
cheaper repair until its cost was measured: the fixed text for that mode asserts
*"<project> owns no project root, so there is no tracked directory above these
repositories that can hold an entry point"*, which is false for a project whose
root is a working tree with a remote, and which its own profile contradicts four
lines later. A folded root file cannot say that, because it is written at the
root it is describing.

**What the fold does not move.** The profile still lives in the **authority**
repository, which need not be the root one, so the root file names the path to it
rather than assuming its own. A generator inferring that path from *whether the
facts block is present* is correct only while the two repositories are the same,
which is true for every single-repository project and false here.

The three cases are one rule - **the content is attached to a file that can
exist** - and this section states all of them rather than leaving the next to be
found by the project that cannot host it.

### 5.2b A public entry point names no private repository

**A generated file in a `public` repository names no repository declared
`private`** - not in the authority chain, not in the profile path, not in prose.

The entry point restates the chain so an agent can find it before reading the
profile. In a public repository that restatement is a disclosure: it publishes
the names of private repositories and the internal paths of documents inside
them. A reader outside the project cannot act on any of it, and a reader who
should not know those repositories exist now does.

So the chain is filtered to entries a public reader could already reach, and the
generator says plainly that the rest is withheld. An agent working inside the
project is unaffected - it has the repositories checked out and resolves the
profile through the runtime, which is where that lookup belongs. The entry point
was never the only route to the chain; in a public repository it is the wrong
one.

This is not a redaction of something otherwise correct. **Publishing it was the
defect**, and the filtered file is the correct output.

Found by SilkPlot on 2026-07-31: `sp-graph` is public, its three siblings are
private, and its own public-surface gate refused the generated `AGENTS.md` for
naming them nine times. The generator had no notion of visibility, so every
bootstrap of a mixed-visibility project produced the same leak.

### 5.2a Where canon and the project both state a rule

Canon owns its concerns absolutely. Where a project states one canon owns, the
project's statement is **overridden** - retired under section 2.7 and replaced by
a reference - and the generated entry point carries the reference in its place.

This is why the entry point is generated rather than left alone. A project whose
agent guide lists its own governance documents is not wrong to want that list; it
is wrong to maintain a second copy of the rules those documents restate. The
generated file renders the authority chain and the repository's own `rules` path,
which is that list, sourced from the one place that owns it.

An agent reading the generated file therefore reaches everything the project's
former guide pointed at, and nothing the project no longer owns.

### 5.2b Every artifact this section names has a producer

Where this contract says an artifact **is generated**, something generates it and
a check proves the set is complete. A section describing an artifact nothing
produces reads exactly like one describing an artifact something does - canon's
authority does not distinguish a rule from a report.

The vendor pointer in section 5.4 was specified and unimplemented until a pilot
needed it, and would have stayed that way indefinitely because reading cannot
find it.

### 5.3 What they never contain

- Rules of their own.
- Method that canon already owns; canon is referenced, never copied.
- Any claim to be authoritative.

### 5.4 Vendor entry points

A vendor-specific entry point - `CLAUDE.md` and its equivalents - is generated
as a pointer to `AGENTS.md` and carries no rules of its own. Where a project
already maintains both as parallel authored files, that duplication is retired
under section 2.7 rather than preserved.

### 5.5 Validity

The generated set is valid only when every generated file corresponds to a
declared repository, **every declared repository that declares `entry_point:
generated` has one**, and no generated file contains content absent from the
profile. A generated file that has drifted from the profile is regenerated, never
edited.

**A repository declaring `entry_point: none` must NOT have one**, and that is a
validity condition in its own direction rather than an exemption from counting. A
generated file sitting in a repository the profile says is not generated into is
the state a pre-field project and a bypassed run both leave behind, and neither is
visible any other way.

**This clause and section 5.5's regeneration instruction were the defect
together.** *"Regenerated, never edited"* sends a session that notices drift to
run the generator, and until 2026-08-11 the generator had no scope: it wrote to
every declared repository and offered no way to express an answer a project and
its human had already settled. So a settled decision was enforced by prose alone
and undone by following this section as written. ORKS reported it having lost
three authored public entry points to one unscoped run; `decisions/0114`.

**The project-root file is required exactly where section 2.3 says the project
owns a root**, and is absent - not missing - where it says otherwise. A project
declaring `authority` and carrying a file at its project root has written durable
state outside every declared repository, which is a defect in the same direction
as the missing one and is not caught by counting files.

**No generated file sits outside a declared repository.** That is the rule the
project-root file was silently breaking for every project whose root is a shared
directory, and it is why the answer is not "waive the file".

## Scope of this skill

A parameter declared nowhere is not absent, it is unaccounted for. `none` is
stated, never omitted.
