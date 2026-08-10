import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";

const FORBIDDEN_DIRECTORY_NAMES = new Set([
  ".git",
  ".tmp",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return false;
  if (value.includes("\\") || value.includes("\0") || isAbsolute(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export function isForbiddenArtifactPath(value) {
  const lower = value.toLowerCase();
  const segments = lower.split("/");
  if (segments.some((segment) => FORBIDDEN_DIRECTORY_NAMES.has(segment))) return true;
  if (lower.endsWith(".zip") || lower.endsWith(".tsbuildinfo")) return true;
  const basename = segments.at(-1) ?? "";
  if (basename === ".env") return true;
  if (basename.startsWith(".env.") && basename !== ".env.example") return true;
  return false;
}

export function findForbiddenPaths(paths) {
  return paths.filter((path) => !isSafeRelativePath(path) || isForbiddenArtifactPath(path));
}

export function validateManifestEntries(entries, { allowForbidden = false } = {}) {
  const errors = [];
  if (entries.length === 0) errors.push("manifest is empty");

  for (const entry of entries) {
    if (!isSafeRelativePath(entry)) errors.push(`unsafe path: ${entry}`);
    if (!allowForbidden && isForbiddenArtifactPath(entry)) errors.push(`forbidden artifact: ${entry}`);
  }

  if (new Set(entries).size !== entries.length) errors.push("manifest contains duplicate entries");
  const sorted = [...entries].sort();
  if (entries.some((entry, index) => entry !== sorted[index])) errors.push("manifest entries are not sorted");
  return errors;
}

function parseManifest(contents) {
  return contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function trackedFiles(root) {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => existsSync(join(root, path)));
}

function assertNoErrors(label, errors) {
  if (errors.length > 0) throw new Error(`${label}: ${errors.join("; ")}`);
}

export async function verifyReleasePolicy(root, releaseVersion) {
  const releaseDirectory = join(root, `release-v${releaseVersion.replace(/\.0$/u, "")}`);
  const updateManifestPath = join(releaseDirectory, "update-files.txt");
  const deletionManifestPath = join(releaseDirectory, "deleted-files.txt");

  const updateEntries = parseManifest(await readFile(updateManifestPath, "utf8"));
  assertNoErrors("invalid update manifest", validateManifestEntries(updateEntries));
  for (const entry of updateEntries) {
    if (!(await pathExists(join(root, entry)))) throw new Error(`update manifest file is missing: ${entry}`);
  }

  const deletedEntries = parseManifest(await readFile(deletionManifestPath, "utf8"));
  assertNoErrors("invalid deletion manifest", validateManifestEntries(deletedEntries, { allowForbidden: true }));
  for (const entry of deletedEntries) {
    if (!isForbiddenArtifactPath(entry)) throw new Error(`deletion target is not a forbidden artifact: ${entry}`);
    if (await pathExists(join(root, entry))) throw new Error(`deletion target still exists: ${entry}`);
  }

  const tracked = trackedFiles(root);
  if (tracked !== null) {
    const forbidden = findForbiddenPaths(tracked);
    if (forbidden.length > 0) throw new Error(`forbidden tracked artifacts: ${forbidden.join(", ")}`);
  }

  return {
    updateEntries: updateEntries.length,
    deletedEntries: deletedEntries.length,
    trackedEntries: tracked?.length ?? null,
  };
}
