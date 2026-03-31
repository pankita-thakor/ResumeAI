import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load server/.env regardless of process cwd (e.g. monorepo root when using `npm run dev`).
 */
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(serverDir, ".env") });
