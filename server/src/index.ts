import "./loadEnv.js";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { askRouter } from "./routes/ask.js";
import { resumeRouter } from "./routes/resume.js";
import { systemRouter } from "./routes/system.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  })
);
app.use(express.json({ limit: "2mb" }));

app.use("/api", systemRouter);
app.use("/api/resume", resumeRouter);
app.use("/api", askRouter);

app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("[API error]", err);
    if (res.headersSent) return;
    const message =
      err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
);

app.listen(port, "0.0.0.0", () => {
  console.log(
    `API listening on http://localhost:${port} and http://127.0.0.1:${port} (CORS: reflect Origin)`
  );
});
