/**
 * Mirrors the client build into a repo-root `dist/`.
 *
 * Vercel resolves the Output Directory against whichever directory it decided the project
 * lives in, and this repo's deploy has it pointed at the root while the build itself runs
 * scoped to the `client` workspace — so a single `client/dist` satisfies one reading of the
 * config and not the other ("No Output Directory named \"dist\" found").
 *
 * Copying rather than moving keeps `client/dist` intact, so `npm run preview -w client` and
 * any local tooling that expects the Vite default still work.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(repoRoot, "client/dist");
const target = resolve(repoRoot, "dist");

if (!existsSync(source)) {
  console.error(`stage-output: ${source} does not exist — run the client build first.`);
  process.exit(1);
}

// Stale files from an earlier build would otherwise survive, since cpSync merges.
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

console.log(`stage-output: copied client/dist -> dist`);
