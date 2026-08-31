import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/** Resolve a decoded repository link and reject normalized traversal. */
export function resolveInsideRoot(root, base, rawTarget) {
	let decoded;
	try {
		decoded = decodeURIComponent(rawTarget);
	} catch {
		return undefined;
	}
	const boundary = resolve(root);
	const target = resolve(base, decoded);
	return target === boundary || target.startsWith(`${boundary}${sep}`)
		? target
		: undefined;
}

/** Read a tracked public artifact without ever following a symbolic link. */
export function readPublicArtifact(root, relativePath) {
	const path = join(root, relativePath);
	const stat = lstatSync(path);
	if (!stat.isSymbolicLink()) {
		return {
			text: readFileSync(path, "utf8"),
			symlink: false,
			symlinkTarget: null,
			symlinkEscapesRoot: false,
		};
	}

	const symlinkTarget = readlinkSync(path);
	const resolvedTarget = resolveInsideRoot(root, dirname(path), symlinkTarget);
	let symlinkTargetExists = false;
	if (resolvedTarget !== undefined) {
		try {
			lstatSync(resolvedTarget);
			symlinkTargetExists = true;
		} catch {
			// A dangling link is itself the public artifact; its target is not read.
		}
	}
	return {
		text: symlinkTarget,
		symlink: true,
		symlinkTarget,
		symlinkEscapesRoot: resolvedTarget === undefined,
		symlinkTargetExists,
	};
}
