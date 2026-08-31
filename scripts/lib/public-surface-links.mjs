import { constants, lstatSync, readFileSync, readlinkSync } from "node:fs";
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
	try {
		return {
			// Open and read as one operation with O_NOFOLLOW. A separate lstat then
			// read would allow the path to be replaced by a symlink between calls.
			text: readFileSync(path, {
				encoding: "utf8",
				flag: constants.O_RDONLY | constants.O_NOFOLLOW,
			}),
			symlink: false,
			symlinkTarget: null,
			symlinkEscapesRoot: false,
		};
	} catch (error) {
		if (error?.code !== "ELOOP") throw error;
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
