import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

// Banner for Node.js targets (regular server + Vercel)
const banner = {
  js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
  `,
};

// Banner for Cloudflare Workers / Pages Functions.
// import.meta.url is undefined in Workers, so use a fixed fake file URL instead.
const cfBanner = {
  js: `import { createRequire as __bannerCrReq } from 'node:module';
import * as __nodeStream from 'node:stream';
import * as __nodeEvents from 'node:events';

// In Workers, require('stream') / require('events') return a module namespace
// object instead of the Stream / EventEmitter class (as Node does), which breaks
// util.inherits(...) in Express's dependencies. Return the real classes.
const __baseRequire = __bannerCrReq('file:///worker/index.js');
const __fixNs = (ns) => {
  const d = ns.default;
  if (typeof d === 'function') return d;
  if (typeof ns.Stream === 'function') return ns.Stream;
  return ns;
};
const __overrides = { stream: __nodeStream, events: __nodeEvents };
globalThis.require = function (id) {
  const key = String(id).replace(/^node:/, '');
  if (Object.prototype.hasOwnProperty.call(__overrides, key)) return __fixNs(__overrides[key]);
  return __baseRequire(id);
};
globalThis.__filename = '/worker/index.js';
globalThis.__dirname = '/worker';
`,
};

// Cloudflare Workers doesn't implement some Node built-ins (tty, worker_threads, ...).
// Packages like debug/pino import them at load time but never use them here,
// so replace them with harmless stubs.
const stubUnsupportedNodeModules = {
  name: "stub-unsupported-node-modules",
  setup(build) {
    build.onResolve(
      { filter: /^(node:)?(tty|worker_threads|child_process|cluster|inspector|repl|vm)$/ },
      (args) => ({ path: args.path, namespace: "cf-stub" }),
    );
    build.onLoad({ filter: /.*/, namespace: "cf-stub" }, () => ({
      contents:
        "module.exports = { isatty: () => false, Worker: class {}, isMainThread: true, workerData: null, parentPort: null, threadId: 0 };",
      loader: "js",
    }));
  },
};

// debug's Node build needs node:tty; its browser build works fine in Workers.
// Resolve `import "debug"` to the browser build from wherever it was imported.
const debugBrowserBuild = {
  name: "debug-browser-build",
  setup(build) {
    build.onResolve({ filter: /^debug$/ }, (args) =>
      build.resolve("debug/src/browser.js", {
        resolveDir: args.resolveDir,
        kind: args.kind,
      }),
    );
  },
};

const commonExternals = [
  "*.node",
  "sharp",
  "better-sqlite3",
  "sqlite3",
  "canvas",
  "bcrypt",
  "argon2",
  "fsevents",
  "re2",
  "farmhash",
  "xxhash-addon",
  "bufferutil",
  "utf-8-validate",
  "ssh2",
  "cpu-features",
  "dtrace-provider",
  "isolated-vm",
  "lightningcss",
  "pg-native",
  "oracledb",
  "mongodb-client-encryption",
  "handlebars",
  "knex",
  "typeorm",
  "protobufjs",
  "onnxruntime-node",
  "@tensorflow/*",
  "@prisma/client",
  "@mikro-orm/*",
  "@grpc/*",
  "@swc/*",
  "@aws-sdk/*",
  "@azure/*",
  "@opentelemetry/*",
  "@google-cloud/*",
  "@google/*",
  "googleapis",
  "firebase-admin",
  "@parcel/watcher",
  "@sentry/profiling-node",
  "@tree-sitter/*",
  "aws-sdk",
  "classic-level",
  "dd-trace",
  "ffi-napi",
  "grpc",
  "hiredis",
  "kerberos",
  "leveldown",
  "miniflare",
  "mysql2",
  "newrelic",
  "odbc",
  "piscina",
  "realm",
  "ref-napi",
  "rocksdb",
  "sass-embedded",
  "sequelize",
  "serialport",
  "snappy",
  "tinypool",
  "usb",
  "workerd",
  "wrangler",
  "zeromq",
  "zeromq-prebuilt",
  "playwright",
  "puppeteer",
  "puppeteer-core",
  "electron",
];

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  // Regular server build (Replit / any long-running process)
  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [...commonExternals, "nodemailer"],
    sourcemap: "linked",
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner,
  });

  // Vercel serverless function bundle
  // Outputs to /api/index.mjs — Vercel auto-discovers functions in the /api directory.
  // outdir is required (not outfile) because the pino plugin emits worker side-files.
  const vercelApiDir = path.resolve(artifactDir, "../../api");
  await esbuild({
    entryPoints: { index: path.resolve(artifactDir, "src/api.ts") },
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: vercelApiDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // nodemailer is intentionally bundled (pure JS, needed in serverless)
    external: commonExternals,
    sourcemap: false,
    // No pino-pretty transport in serverless — plain JSON to stdout
    plugins: [esbuildPluginPino({ transports: [] })],
    banner,
  });

  // ─── Cloudflare Pages Function bundle ────────────────────────────────────
  // Outputs to functions/api/[[path]].js (Cloudflare Pages Function).
  // This file is used as-is by Cloudflare Pages — no re-bundling needed.
  //
  // Requires: nodejs_compat compatibility flag.
  // Node.js built-ins (http, crypto, etc.) are left as external — CF Workers
  // provides them via nodejs_compat.
  //
  // import.meta.url does not exist in Workers, so it is replaced with a fixed
  // fake file URL (both in the banner and via `define` for bundled code).
  const cfFunctionDir = path.resolve(artifactDir, "../../functions/api");
  await esbuild({
    entryPoints: { "[[path]]": path.resolve(artifactDir, "src/cf-pages-function.ts") },
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: cfFunctionDir,
    outExtension: { ".js": ".js" },
    logLevel: "info",
    // nodemailer is bundled (pure JS); pg is excluded (replaced by @neondatabase/serverless)
    external: [...commonExternals, "pg", "pg-native"],
    sourcemap: false,
    plugins: [
      stubUnsupportedNodeModules,
      debugBrowserBuild,
      esbuildPluginPino({ transports: [] }),
    ],
    banner: cfBanner,
    define: {
      "import.meta.url": JSON.stringify("file:///worker/index.js"),
    },
    // Ensure we don't accidentally bundle native addons
    conditions: ["worker", "browser", "module"],
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
