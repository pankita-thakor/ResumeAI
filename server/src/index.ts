import { app, bootstrap, clientOrigins } from "./app.js";

/**
 * Standalone-server entry point (local `npm run dev`, or a long-running host like Render).
 *
 * On Vercel the same Express app is served by `api/index.js` instead, which never runs this
 * file — nothing here may be required for the app to handle a request.
 */
const port = Number(process.env.PORT) || 3001;

// Bind the port first so the service is always reachable and self-describing via
// /api/health; mongoose queues operations and reconnects on its own.
void bootstrap();

app.listen(port, "0.0.0.0", () => {
  console.log(
    `API listening on port ${port} (CORS: ${
      clientOrigins.length ? clientOrigins.join(", ") : "reflect request Origin"
    })`
  );
});
