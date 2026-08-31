const PUBLIC_SP_IDENTIFIER = /^(?:sp-graph|sp-(?:brand|cal|cat|color|font|motion|radius|series|space)(?:-[a-z0-9-]*)?|sp-(?:contrast|focusable|legend-item|logo-title|mark-title|test|theme))$/i;

const GENERATED_ORCA_ARTIFACT =
	/^(?:AGENTS\.md|CLAUDE\.md|skills-lock\.json|(?:\.agents|\.claude)\/skills\/.+)$/;

const METHOD_PREFIX = ["or", "ca"].join("");
const DISTRIBUTION_REPOSITORY = [METHOD_PREFIX, "baseline"].join("-");

/** Canonical identifier rules for the public-surface gate. */
const FORBIDDEN = [
	{
		id: "method-distribution",
		pattern: /\b(?:Probably\x43omputers|or\x63a-baseline)\b/gi,
		allow: (_identifier, file) => GENERATED_ORCA_ARTIFACT.test(file),
		why: "private method-distribution provenance. Only the exact generated install paths authorized by the project profile may carry it.",
	},
	{
		id: "method-capability",
		pattern: /\bor\x63a-[a-z0-9][a-z0-9-]*\b/gi,
		allow: (identifier, file) =>
			identifier.toLowerCase() === DISTRIBUTION_REPOSITORY ||
			GENERATED_ORCA_ARTIFACT.test(file),
		why: "an internal method capability name. Only the exact generated install paths authorized by the project profile may carry it.",
	},
	{
		id: "method-role-metadata",
		pattern:
			/\bRoles?:\s*`?(?:public|authority|planning|documentation|implementation|research|operations|code|docs|standards|meta)`?(?:\s*,\s*`?(?:public|authority|planning|documentation|implementation|research|operations|code|docs|standards|meta)`?)*\.?/gi,
		allow: (_identifier, file) => GENERATED_ORCA_ARTIFACT.test(file),
		why: "internal method-role metadata. Ordinary public files may use these English words, but may not present them as method install metadata.",
	},
	{
		id: "private-repo",
		// Public CSS, DOM and test identifiers share the `sp-` prefix. Keep their
		// namespaces explicit and reject every other org-style identifier without
		// encoding the names of the private repository estate in this public file.
		pattern: /\bsp-[a-z0-9][a-z0-9-]*\b/gi,
		allow: (identifier) => PUBLIC_SP_IDENTIFIER.test(identifier),
		why: "a private repository name. A reader outside cannot follow it, and naming it discloses that the document exists while giving them nothing actionable.",
	},
	{
		id: "research-id",
		pattern: /\bSR-\d{3}\b/gi,
		why: "an internal research identifier. The research itself is private; cite the public decision record it produced instead.",
	},
	{
		id: "planning-id",
		// A complete sprint/phase identifier is unambiguous even when a pathname
		// lowercases it. Lettered and named suffixes remain part of the identifier.
		pattern: /\bS\d{3}(?:-P\d{2}(?:[A-Za-z0-9]+|-[A-Za-z0-9-]+)?)?\b/gi,
		why: "an internal planning identifier. Public documentation must stand on its own reasoning, not on a sprint plan nobody outside can read.",
	},
	{
		id: "planning-phase-shorthand",
		// Standalone phase shorthand is case-sensitive. Lowercase p50/p95 and
		// names such as p50Ms/rawP95 are percentile identifiers throughout the
		// performance code, not private phase references.
		pattern: /(?<![A-Za-z0-9]-)\bP\d{2}(?:[A-Za-z]+|-[A-Za-z0-9-]+)?\b/g,
		why: "an internal planning identifier. Public documentation must stand on its own reasoning, not on a sprint plan nobody outside can read.",
	},
	{
		id: "planning-label",
		pattern: /\bSprint\s+\d{3}\b/gi,
		why: "an internal planning identifier. Public documentation must stand on its own reasoning, not on a sprint plan nobody outside can read.",
	},
	{
		id: "method-id",
		pattern: /\bCANON-\d{3}[A-Za-z]?\b/gi,
		allow: (_identifier, file) => GENERATED_ORCA_ARTIFACT.test(file),
		why: "an internal method identifier. Only the exact generated install paths authorized by the project profile may carry method provenance.",
	},
	{
		id: "runtime-id",
		pattern: /\b(?:gate|task|ctx)_[a-z0-9]+\b/gi,
		why: "an internal runtime or decision identifier. Public artifacts must state the decision or evidence directly instead of exposing a private runtime record.",
	},
];

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

export function internalIdentifierFindings(file, text) {
	const findings = [];
	for (const rule of FORBIDDEN) {
		rule.pattern.lastIndex = 0;
		for (const match of text.matchAll(rule.pattern)) {
			if (rule.allow?.(match[0], file)) continue;
			findings.push({
				file,
				line: lineOf(text, match.index ?? 0),
				match: match[0],
				why: rule.why,
			});
		}
	}
	return findings;
}

/** A tracked pathname is public even when its contents are binary. */
export const internalPathIdentifierFindings = (path) =>
	internalIdentifierFindings(path, path);
