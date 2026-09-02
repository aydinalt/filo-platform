#!/usr/bin/env node
import { spawn } from "node:child_process";
import { accessSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const toolEntrypoints = {
  vite: "node_modules/vite/bin/vite.js",
  vinext: "node_modules/vinext/dist/cli.js",
  tsc: "node_modules/typescript/bin/tsc",
  eslint: "node_modules/eslint/bin/eslint.js",
  "drizzle-kit": "node_modules/drizzle-kit/bin.cjs",
};

export function parseDuration(value, fallbackMs) {
  if (!value) return fallbackMs;
  const match = String(value).trim().match(/^(\d+)(ms|s|m)?$/u);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  return amount * (match[2] === "m" ? 60_000 : match[2] === "s" ? 1_000 : 1);
}

export function sitesEnvironment(extra = {}) {
  const runtimeRoot = resolve(process.env.SITES_RUNTIME_ROOT || resolve(projectRoot, ".sites-runtime"));
  const directories = {
    cache: resolve(runtimeRoot, "npm-cache"),
    config: resolve(runtimeRoot, "xdg-config"),
    temp: resolve(runtimeRoot, "tmp"),
    wrangler: resolve(runtimeRoot, "wrangler", "logs"),
  };
  for (const directory of Object.values(directories)) mkdirSync(directory, { recursive: true });
  const env = {
    ...process.env,
    SITES_ENV_READY: "1",
    SITES_PROJECT_ROOT: projectRoot,
    XDG_CONFIG_HOME: directories.config,
    TMPDIR: directories.temp,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: directories.wrangler,
    MINIFLARE_REGISTRY_PATH: resolve(runtimeRoot, "wrangler", "registry"),
    npm_config_cache: directories.cache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    ...extra,
  };
  for (const key of ["npm_config_proxy", "npm_config_http_proxy", "npm_config_https_proxy", "NPM_CONFIG_PROXY", "NPM_CONFIG_HTTP_PROXY", "NPM_CONFIG_HTTPS_PROXY"]) delete env[key];
  return env;
}

export function localToolPath(name) {
  const relative = toolEntrypoints[name];
  if (!relative) throw new Error(`Unsupported local tool: ${name}`);
  const entrypoint = resolve(projectRoot, relative);
  accessSync(entrypoint);
  return entrypoint;
}

export function npmCliPath() {
  if (!process.env.npm_execpath) throw new Error("npm_execpath is unavailable; run this command through npm.");
  return process.env.npm_execpath;
}

export async function runProcess(command, args, { cwd = projectRoot, env = sitesEnvironment(), timeoutMs = 0 } = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", windowsHide: true });
    let timer;
    let timedOut = false;
    if (timeoutMs > 0) timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, timeoutMs);
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (timedOut) rejectRun(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      else if (code === 0) resolveRun();
      else rejectRun(new Error(`Command failed (${code ?? signal ?? "unknown"}): ${command}`));
    });
  });
}

export function runTool(name, args = [], options = {}) {
  return runProcess(process.execPath, [localToolPath(name), ...args], options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [name, ...args] = process.argv.slice(2);
  if (!name) throw new Error("usage: node scripts/run-tool.mjs <tool> [args...]");
  await runTool(name, args);
}
