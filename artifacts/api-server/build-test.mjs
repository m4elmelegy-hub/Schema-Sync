/**
 * build-test.mjs
 * يبني ملف اختبارات سلامة البيانات إلى dist/integrity.test.mjs
 * ثم يُشغِّله عبر node --test
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { spawn } from "node:child_process";

globalThis.require = createRequire(import.meta.url);
const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildTest() {
  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/tests/integrity.test.ts")],
    platform:    "node",
    bundle:      true,
    format:      "esm",
    outdir:      path.resolve(artifactDir, "dist"),
    outExtension: { ".js": ".mjs" },
    logLevel:    "warning",
    external: [
      "*.node", "pg-native", "bcrypt", "argon2",
    ],
    banner: {
      js: `import { createRequire as __cr } from 'node:module';
import __p from 'node:path';
import __u from 'node:url';
globalThis.require = __cr(import.meta.url);
globalThis.__filename = __u.fileURLToPath(import.meta.url);
globalThis.__dirname = __p.dirname(globalThis.__filename);
`,
    },
  });
  console.log("✅ Test bundle compiled: dist/integrity.test.mjs");
}

async function runTest() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-reporter=spec", "dist/integrity.test.mjs"],
      { cwd: artifactDir, stdio: "inherit", env: process.env },
    );
    child.on("exit", code => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`Tests exited with code ${code}`));
    });
  });
}

buildTest()
  .then(runTest)
  .catch(err => {
    console.error(err.message);
    process.exit(1);
  });
