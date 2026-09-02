import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Align proxy with API `PORT` in server/.env (default 3001). Hardcoding 3001 breaks dev when PORT differs. */
function apiProxyTarget(): string {
  const fromEnv = process.env.PORT?.trim();
  if (fromEnv && /^\d+$/.test(fromEnv)) {
    return `http://127.0.0.1:${fromEnv}`;
  }
  const envPath = path.join(__dirname, "..", "server", ".env");
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*PORT\s*=\s*(.+?)\s*$/i);
      if (!m) continue;
      let v = m[1].trim().replace(/\s+#.*$/, "");
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (/^\d+$/.test(v)) return `http://127.0.0.1:${v}`;
    }
  } catch {
    /* no server/.env */
  }
  return "http://127.0.0.1:3001";
}

const proxyTarget = apiProxyTarget();

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly: on some Windows setups "localhost" hits ::1 while the API is on 127.0.0.1.
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        timeout: 600_000,
        proxyTimeout: 600_000,
        /**
         * Without this, an API that isn't running makes the proxy answer with a bare
         * `500 Internal Server Error` and an empty body — which reads like a server-side
         * crash in the app. Reply with JSON the UI can actually display instead.
         */
        configure(proxy) {
          proxy.on("error", (err, _req, res) => {
            const message =
              `Dev proxy could not reach the API at ${proxyTarget}. ` +
              "Start it with `npm run dev` from the repo root (both client and server), " +
              "or `npm run dev:server` for the API alone. " +
              `If the API uses a different port, set PORT in server/.env. (${err.message})`;

            console.error(`\n[vite proxy] ${message}\n`);

            // `res` is a ServerResponse for normal requests, a raw Socket for ws upgrades.
            if ("writeHead" in res) {
              if (res.headersSent) {
                res.end();
                return;
              }
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: message }));
              return;
            }
            res.destroy();
          });
        },
      },
    },
  },
});
