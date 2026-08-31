/** Validate attribution CLI inputs before a browser or output pass is started. */
export function validateAttributionRequest({ repeats, gestures, table }) {
	if (!Number.isInteger(repeats) || repeats < 1) {
		throw new Error("--repeats must be a positive integer");
	}
	if (!Array.isArray(gestures) || gestures.length === 0) {
		throw new Error("--gestures must request at least one gesture");
	}
	if (new Set(gestures).size !== gestures.length) {
		throw new Error("--gestures cannot contain duplicates");
	}
	if (table !== "derived" && table !== "none") {
		throw new Error("--table must be derived or none");
	}
}
