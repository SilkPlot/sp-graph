/** Canonical identifier rules for the public-surface gate. */
const FORBIDDEN = [
	{
		id: "private-repo",
		// Word-bounded so `sp-graph` — the public one — cannot match.
		pattern: /\bsp-(?:docs|planning|research)\b/gi,
		why: "a private repository name. A reader outside cannot follow it, and naming it discloses that the document exists while giving them nothing actionable.",
	},
	{
		id: "research-id",
		pattern: /\bSR-\d{3}\b/g,
		why: "an internal research identifier. The research itself is private; cite the public decision record it produced instead.",
	},
	{
		id: "planning-id",
		// Phase identifiers may carry a letter or named suffix, such as P04b or
		// P01-MAP. Match the complete private identifier, not only its numeric stem.
		pattern: /\bS\d{3}-P\d{2}(?:[A-Za-z0-9]+|-[A-Za-z0-9-]+)?\b/g,
		why: "an internal planning identifier. Public documentation must stand on its own reasoning, not on a sprint plan nobody outside can read.",
	},
];

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

export function internalIdentifierFindings(file, text) {
	const findings = [];
	for (const rule of FORBIDDEN) {
		rule.pattern.lastIndex = 0;
		for (const match of text.matchAll(rule.pattern)) {
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
