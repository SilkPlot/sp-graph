import {
  chmodSync,
  constants,
  copyFileSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

function inside(root, relativePath) {
  const boundary = resolve(root);
  const target = resolve(boundary, relativePath);
  if (target !== boundary && !target.startsWith(`${boundary}${sep}`)) {
    throw new Error(`probe snapshot path is outside source root: ${relativePath}`);
  }
  return target;
}

function copyEntry(sourceRoot, targetRoot, relativePath) {
  const source = inside(sourceRoot, relativePath);
  const target = inside(targetRoot, relativePath);
  let stat;
  try {
    stat = lstatSync(source);
  } catch (error) {
    // `git ls-files --cached` includes a tracked path deleted in the working
    // tree. Its absence is part of the snapshot, not a copy failure.
    if (error?.code === "ENOENT") return;
    throw error;
  }
  mkdirSync(dirname(target), { recursive: true });
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), target);
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`probe snapshot entry is not a file or symbolic link: ${relativePath}`);
  }
  copyFileSync(source, target, constants.COPYFILE_FICLONE);
  chmodSync(target, stat.mode);
}

/**
 * Materialize an independent disposable checkout snapshot.
 *
 * The dependency tree is copied with copy-on-write where the filesystem
 * supports it. It is never symlinked or hard-linked: Vite caches and package
 * state written by a probe must be just as isolated as the source mutation.
 */
export function createProbeSnapshot(sourceRoot, relativePaths) {
  const container = mkdtempSync(join(tmpdir(), "silkplot-probe-snapshot-"));
  const root = join(container, "repo");
  const cleanup = () => rmSync(container, { recursive: true, force: true });
  try {
    mkdirSync(root);
    for (const relativePath of relativePaths) copyEntry(sourceRoot, root, relativePath);
    cpSync(join(sourceRoot, "node_modules"), join(root, "node_modules"), {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      mode: constants.COPYFILE_FICLONE,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    return { root, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
