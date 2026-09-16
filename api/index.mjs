/**
 * Vercel Serverless Function wrapping the Express API.
 *
 * The client and the API therefore live on one origin, so the browser makes same-origin
 * `/api/...` requests: no second host to keep alive, no VITE_API_URL to bake in at build
 * time, and no CORS list to maintain.
 *
 * `.mjs`, not `.js`: the repo root has no `"type": "module"`, so a `.js` file here would be
 * treated as CommonJS and could not statically import the ESM server build.
 *
 * The import target is build output — `vercel.json`'s buildCommand compiles `server/src` to
 * `server/dist` before functions are bundled. A "Cannot find module '../server/dist/app.js'"
 * error at build time means that compile step did not run.
 */
import { app, bootstrap } from "../server/dist/app.js";

export default async function handler(req, res) {
  // Awaited rather than fired-and-forgotten: a cold instance would otherwise run its first
  // query against a socket that is still dialling. `bootstrap()` is memoised, so warm
  // invocations resolve immediately.
  await bootstrap();
  return app(req, res);
}
