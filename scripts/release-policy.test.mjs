import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  findForbiddenPaths,
  isForbiddenArtifactPath,
  isSafeRelativePath,
  validateManifestEntries,
} from "./release-policy.mjs";

test("accepts safe repository source paths", () => {
  assert.equal(isSafeRelativePath("apps/api/src/app.ts"), true);
  assert.equal(isForbiddenArtifactPath(".env.example"), false);
  assert.deepEqual(findForbiddenPaths(["package.json", "docs/LOCAL_UPDATE_v0.49.md"]), []);
});

test("rejects unsafe relative paths", () => {
  for (const path of ["../secret", "/absolute", "apps\\api", "docs//file.md", " ./file"]) {
    assert.equal(isSafeRelativePath(path), false, path);
  }
});

test("detects forbidden repository and package artifacts", () => {
  const paths = [
    "node_modules/a.js",
    "apps/web/dist/a.js",
    ".env",
    "build.zip",
    "cache.tsbuildinfo",
    "packages/contracts/src/README.md",
    "packages/contracts/src/package-lock.json",
    "packages/contracts/src/package.json",
  ];
  assert.deepEqual(findForbiddenPaths(paths), paths);
});

test("allows legitimate package metadata outside the accidental source paths", () => {
  const paths = ["packages/contracts/package.json", "packages/database/package.json", "README.md"];
  assert.deepEqual(findForbiddenPaths(paths), []);
});

test("requires update manifests to be sorted and unique", () => {
  assert.deepEqual(validateManifestEntries(["a.txt", "b.txt"]), []);
  assert.match(validateManifestEntries([])[0], /manifest is empty/u);
  assert.match(validateManifestEntries(["b.txt", "a.txt"])[0], /not sorted/u);
  assert.match(validateManifestEntries(["a.txt", "a.txt"])[0], /duplicate/u);
});

test("allows an empty deletion manifest", () => {
  assert.deepEqual(
    validateManifestEntries([], { allowForbidden: true, allowEmpty: true }),
    [],
  );
});

test("rejects forbidden artifacts in update manifests", () => {
  const errors = validateManifestEntries(["apps/web/tsconfig.tsbuildinfo", "archive.zip"]);
  assert.equal(errors.length, 2);
  assert.ok(errors.every((error) => error.startsWith("forbidden artifact:")));
});

test("keeps patched production dependency versions locked", () => {
  const lockfile = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  );

  assert.equal(lockfile.packages?.["node_modules/fast-uri"]?.version, "3.1.5");
  assert.equal(
    lockfile.packages?.["node_modules/fast-json-stringify/node_modules/fast-uri"]?.version,
    "4.1.2",
  );
  assert.equal(lockfile.packages?.["node_modules/nanoid"]?.version, "3.3.18");
});
