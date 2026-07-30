---
name: orca-session-start
description: >-
  Start and close a session correctly. Use at the beginning of any session to
  establish what is approved, what is mounted, and what remains unauthorized;
  and at the end to close out without leaving stale documentation, unpushed
  work, open pull requests, stale branches or worktrees, or an unwritten
  next-session prompt. Also governs destructive-action limits, reporting
  alongside a parallel agent, and what a status report must cover.
metadata:
  baselineVersion: "0.3.0"
  derivedFrom: CANON-006
  generated: true
---

<!--
  GENERATED - DO NOT EDIT.
  Non-authoritative copy, derived from CANON-006 in orca-baseline.
  Baseline version: 0.3.0
  Regenerate with: node build/compile.mjs
  Edits made here are lost on the next update and fix nothing upstream.
-->

# Session Lifecycle

## 1. Startup obligations

1. Read the project profile (CANON-008) and every canonical source it inherits.
2. Read the project's durable records: current handoff, open next-session
   prompt, active task or backlog contract, accepted decisions, and the
   repository-local verification instructions.
3. Check Git status for every repository the profile declares as mounted.
4. Confirm workspace, branch, repository identities, required commit pins, and
   read-write or read-only access modes.
5. Identify the exact approved task, its permitted outputs, its stop conditions,
   and everything that remains unauthorized.
6. Do not inspect or mutate an unmounted or unrelated repository.
7. Reuse recorded closeout evidence instead of re-running it, unless the task
   changes the same surface. Verify live state first-hand for any fact the work
   depends on, per CANON-002.
8. Before editing, report any mismatch between the live workspace and the
   accepted contract - including a branch or worktree whose name corresponds to
   no approved work item. Stop if the mismatch cannot be corrected without new
   authority.

A session must be able to start with **no inherited context** beyond the durable
records. If it cannot, the previous closeout was incomplete.

## 2. Closeout obligations

1. No stale, loose, contradictory or dangling documentation remains.
2. All repository-local validators pass, and the diff is checked for
   whitespace and formatting defects.
3. Every intended diff and staged path is inspected for secrets, credentials,
   private material, host paths, generated state and unrelated changes.
4. Everything is committed and pushed - **when that action is authorized**.
   Authorization is per-action and never transitive.
5. No open pull requests remain, verified across every repository in the
   project.
6. No stale branches, worktrees or workspaces remain, local or remote. Confirm
   rather than assume.
7. Runtime provenance reaches durable storage: the orchestration task, dispatch
   and gate identifiers created this session, and the location of every
   verification report.
8. Remaining gates, residual risks and the exact next action are recorded.
9. The next-session prompt or command is produced.

## 2a. Handing over a blocked action

An action a session cannot take - because authorization was not granted, a
credential is absent, a policy forbids it, or the boundary is someone else's - is
**handed over, never merely reported**.

Reporting that something is blocked moves the work to the human without moving
any of the means. They then reconstruct the command the session already knew.

A handover states, for each blocked action:

| Element | Why |
|---|---|
| The exact command | Runnable as written. Every placeholder named, with its value given |
| What it does | In one line, in plain terms |
| Why it is needed | What is currently broken or unavailable without it |
| What happens if it is not run | The consequence of declining, stated honestly |
| How to verify it worked | A command or observable result, not "it should work" |

The command must be **safe to paste**: prefixed with the `cd` to the right
directory, and with any artificial line-wrapping marked so a copy does not break
it. A command that fails on paste is a handover that did not happen.

Rules:

- **No bare blockers.** "This needs your approval" without the command is an
  incomplete handover.
- **Never guess a command.** Resolve it against the tool's own schema or guide;
  where it genuinely cannot be resolved, say that plainly rather than offering a
  plausible-looking line that fails.
- **Say when there is no command.** Some blocks are decisions, information only
  the human holds, or a change made through an interface with no command surface.
  State which, so the human is not hunting for a command that does not exist.
- Where the action carries risk, say what it changes and what it does not.

The test is whether the human can act without reading the session back. If they
must reconstruct context to run it, the handover was not complete.

## 3. Destructive-action limits

- Never force-remove a dirty workspace.
- Stop terminals before removing anything; preserve all work.
- Remove or archive a worktree only when its state is authenticated, clean or
  deliberately retained, and removal is authorized.
- Never clean, reset, overwrite or discard an unrelated or dirty worktree.

## 4. Parallel agents

Where another agent runs against the same project in parallel:

- Remain aware of it throughout the session.
- Produce a report at the end of closeout that the parallel session can
  consolidate, so the full closeout can be completed once across both.
- Never assume shared runtime state belongs to this session.

## 5. Status report

When a position report is requested, cover exactly:

- where we are;
- what has been completed;
- what is still outstanding; and
- how aligned we are with what we are trying to achieve.

Measured, not asserted. Gaps are stated explicitly rather than omitted.

## Scope of this skill

A session must be able to start with no inherited context beyond the durable
records. If it cannot, the previous closeout was incomplete - and that is a
finding about the closeout, not about the session that suffered it.
