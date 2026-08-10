import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

function fail(message) {
  console.error(`Release verification failed: ${message}`);
  process.exit(1);
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} ${args.join(" ")} exited with ${result.status}`);
}

const [rootPackage, apiPackage, lockfile] = await Promise.all([
  readJson("package.json"),
  readJson("apps/api/package.json"),
  readJson("package-lock.json"),
]);

const releaseVersion = rootPackage.version;
const versionChecks = [
  ["apps/api/package.json", apiPackage.version],
  ["package-lock.json", lockfile.version],
  ["package-lock.json root package", lockfile.packages?.[""]?.version],
  ["package-lock.json API workspace", lockfile.packages?.["apps/api"]?.version],
];

for (const [label, version] of versionChecks) {
  if (version !== releaseVersion) {
    fail(`${label} has version ${version ?? "missing"}; expected ${releaseVersion}`);
  }
}

const migrationNames = (await readdir(join(root, "packages/database/migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationNumbers = new Set();
for (const name of migrationNames) {
  const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
  if (!match) fail(`invalid migration filename: ${name}`);
  if (migrationNumbers.has(match[1])) fail(`duplicate migration number: ${match[1]}`);
  migrationNumbers.add(match[1]);
}

console.log(`Release metadata verified for v${releaseVersion}.`);
console.log(`${migrationNames.length} uniquely numbered migrations verified.`);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
run(npm, ["run", "typecheck"]);
run(npm, ["test"]);
run(npm, ["run", "build"]);

console.log(`\nRelease v${releaseVersion} verification passed.`);
