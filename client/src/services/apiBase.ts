/**
 * Build an absolute API URL.
 *
 * `VITE_API_URL` is inlined at build time, so it must live in `client/.env` (or the host's
 * build environment variables) — a value in `server/.env` is never seen by the Vite build.
 */
export function apiUrl(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return `${fromEnv.replace(/\/$/, "")}${trimmed}`;

  // Dev: vite.config.ts proxies /api to the local API process.
  if (import.meta.env.DEV) return trimmed;

  // Production build with no API origin: a relative /api request is answered by the static
  // host (the SPA's index.html or a 404), which surfaces as a confusing "not JSON" failure.
  throw new Error(
    "VITE_API_URL is not set in this build. Set it to the API origin (e.g. " +
      "https://your-api-host.onrender.com) in the hosting project's environment variables, " +
      "then redeploy."
  );
}
