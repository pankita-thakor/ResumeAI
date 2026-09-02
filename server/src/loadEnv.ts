import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load server/.env regardless of process cwd (e.g. monorepo root when using `npm run dev`).
 */
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(serverDir, ".env") });

/**
 * @google/genai resolves credentials from the environment and gives GOOGLE_API_KEY priority
 * over GEMINI_API_KEY. A stale GOOGLE_API_KEY left on a machine (from another Google project)
 * therefore shadows the key this project is configured with, and every Gemini call fails with
 * a confusing 403 that names a key you never set. Remove it so GEMINI_API_KEY is what's used.
 */
if (process.env.GEMINI_API_KEY?.trim() && process.env.GOOGLE_API_KEY?.trim()) {
  console.warn(
    "[resumeAI] GOOGLE_API_KEY is set in the environment and would override GEMINI_API_KEY — " +
      "ignoring it for this process. Unset it globally if that is not what you want."
  );
  delete process.env.GOOGLE_API_KEY;
}
