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

/**
 * Comma-separated browser origins allowed to call this API.
 *
 * An entry may contain `*`, which matches any run of characters except `.` and `/` — one
 * hostname label. This exists because hosts like Vercel give every preview deployment a
 * fresh hostname (`resume-<hash>-<team>.vercel.app`), so listing them individually means
 * re-editing this variable on every push:
 *
 *   CLIENT_ORIGIN=https://my-app.vercel.app,https://*-my-team.vercel.app
 */
const clientOrigins = (process.env.CLIENT_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

function originMatcher(pattern: string): (origin: string) => boolean {
  if (!pattern.includes("*")) {
    return (origin) => origin === pattern;
  }
  // Escape every regex metacharacter, then re-open the escaped `*` as a label wildcard.
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*/g, "[^./]*");
  const re = new RegExp(`^${source}$`);
  return (origin) => re.test(origin);
}

const originMatchers = clientOrigins.map(originMatcher);

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
    if (originMatchers.length === 0) {
      callback(null, true);
      return;
    }
    if (originMatchers.some((matches) => matches(origin))) {
      callback(null, true);
      return;
    }
    console.warn(
      "[CORS] blocked origin: %s (allowed: %s)",
      origin,
      clientOrigins.join(", ")
    );
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

async function connectMongo() {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");
  } catch (err) {
    // Deliberately NOT fatal. Exiting here would leave the port unbound, so a hosted
    // platform's proxy accepts connections and then hangs forever — every request pends
    // with no status and no error, which is impossible to diagnose from the browser.
    // Staying up means GET /api/health answers 503 with `db: "disconnected"` instead.
    console.error(
      "MongoDB connection FAILED — the API is running but every database route will fail. " +
        "Check MONGODB_URI, and for Atlas confirm the host's IP is allowed under Network Access.",
      err instanceof Error ? err.message : err
    );
  }
}

async function start() {
  // Surface a misconfigured deploy in the logs. Not fatal, for the same reason as
  // connectMongo: a dead process is far harder to diagnose than a running one that
  // reports its own broken config. Token signing still refuses to use a fallback
  // secret, so auth fails loudly rather than insecurely.
  try {
    assertJwtSecret();
  } catch (err) {
    console.error(
      "CONFIG ERROR:",
      err instanceof Error ? err.message : err,
      "\nThe API will start, but signup/login will fail until this is set. " +
        "GET /api/health reports which variables are missing."
    );
  }

  // Non-blocking: a bad SMTP setup should be visible in the logs, not stop the API booting.
  void verifyMailer();

  // Bind the port first so the service is always reachable and self-describing via
  // /api/health; mongoose queues operations and reconnects on its own.
  void connectMongo();

  app.listen(port, "0.0.0.0", () => {
    console.log(
      `API listening on port ${port} (CORS: ${
        clientOrigins.length ? clientOrigins.join(", ") : "reflect request Origin"
      })`
    );
  });
}

/**
 * A crash during boot otherwise kills the process before the port is bound, which on a
 * hosted platform means the proxy accepts connections and hangs — requests pend forever
 * with no status. Log it so the platform's logs show the actual cause.
 */
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
});

start();
