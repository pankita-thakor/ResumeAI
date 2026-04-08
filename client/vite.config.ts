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

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly: on some Windows setups "localhost" hits ::1 while the API is on 127.0.0.1.
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget(),
        changeOrigin: true,
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
});
