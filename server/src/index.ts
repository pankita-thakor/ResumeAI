import "./loadEnv.js";
import cors, { type CorsOptions } from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import { askRouter } from "./routes/ask.js";
import { resumeRouter } from "./routes/resume.js";
import { systemRouter } from "./routes/system.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { assertJwtSecret } from "./utils/jwtSecret.js";
import { verifyMailer } from "./services/mailer.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/resumeai";

/** Comma-separated browser origins (e.g. https://your-app.vercel.app). Required for cross-origin auth in production. */
const clientOrigins = (process.env.CLIENT_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Marker so a disallowed Origin answers 403, not a 500 that reads like a server crash. */
class CorsRejection extends Error {
  constructor(origin: string) {
    super(`Origin ${origin} is not in CLIENT_ORIGIN`);
    this.name = "CorsRejection";
  }
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (clientOrigins.length === 0) {
      callback(null, true);
      return;
    }
    if (clientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    console.warn("[CORS] blocked origin:", origin);
    callback(new CorsRejection(origin));
  },
  methods: ["GET", "POST", "OPTIONS", "DELETE", "PUT", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86_400,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", authRouter);
app.use("/api", systemRouter);
app.use("/api/resume", resumeRouter);
app.use("/api", askRouter);
app.use("/api/chat", chatRouter);


app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    if (res.headersSent) return;

    if (err instanceof CorsRejection) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }

    console.error("[API error]", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
);

async function start() {
  // Surface a misconfigured deploy at boot rather than on the first login attempt.
  assertJwtSecret();

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error(
      "MongoDB connection failed — start MongoDB or set MONGODB_URI in server/.env",
      err
    );
    process.exit(1);
  }

  // Non-blocking: a bad SMTP setup should be visible in the logs, not stop the API booting.
  void verifyMailer();

  app.listen(port, "0.0.0.0", () => {
    console.log(
      `API listening on port ${port} (CORS: ${
        clientOrigins.length ? clientOrigins.join(", ") : "reflect request Origin"
      })`
    );
  });
}

start();
