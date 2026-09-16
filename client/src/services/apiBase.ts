/**
 * Build an API URL.
 *
 * The default is a relative path, i.e. the API is expected on the same origin as the app.
 * That is how the Vercel deploy works: `api/index.mjs` serves the Express app under `/api`
 * in the same project, so there is no second host to point at and nothing to configure.
 *
 * `VITE_API_URL` overrides that with an absolute origin, for the case where the API is
 * hosted separately (e.g. Render). It is inlined at build time, so it must live in
 * `client/.env` or the hosting project's environment variables — a value in `server/.env`
 * is never seen by the Vite build — and changing it requires a redeploy, not just a restart.
 */
export function apiUrl(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return `${fromEnv.replace(/\/$/, "")}${trimmed}`;

  // Dev: vite.config.ts proxies /api to the local API process.
  // Prod: the platform routes /api to the serverless function alongside the static build.
  return trimmed;
}
