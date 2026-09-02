import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { runPineconeSelfTest } from "../services/pineconeSelfTest.js";
import { isMailerConfigured } from "../services/mailer.js";

export const systemRouter = Router();

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

/** Root of /api — discoverable route list. */
systemRouter.get("/", (_req, res) => {
  res.json({
    service: "resumeAI-api",
    version: 1,
    routes: {
      "GET /api": "this listing",
      "GET /api/health": "liveness",
      "GET /api/pinecone-test": "Pinecone upsert + query + cleanup probe",
      "POST /api/resume/index": "JSON { resumeText } → chunk/embed/store Pinecone + resumeId",
      "POST /api/resume/upload-pdf": "multipart resumePdf → same as index",
      "POST /api/ask": "JSON: { resumeText, question } or { resumeId, question }",
      "POST /api/ask-pdf": "multipart: resumePdf + question (one-shot, no resumeId)",
    },
  });
});

/**
 * Liveness + deploy diagnostics. Reports whether the pieces auth depends on are configured,
 * without echoing any secret or connection string.
 */
systemRouter.get("/health", (_req, res) => {
  // readyState is 0-3, plus 99 for "uninitialized".
  const dbStates: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
    99: "uninitialized",
  };
  const db = dbStates[mongoose.connection.readyState] ?? "unknown";
  const ok = db === "connected";
  res.status(ok ? 200 : 503).json({
    ok,
    db,
    config: {
      jwtSecret: Boolean(process.env.JWT_SECRET?.trim()),
      clientOrigin: Boolean(process.env.CLIENT_ORIGIN?.trim()),
      clientUrl: Boolean(process.env.CLIENT_URL?.trim()),
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
      // false = reset links are logged to the server console instead of emailed.
      smtp: isMailerConfigured(),
    },
  });
});

/** Insert a probe vector, query it, delete it — verifies Pinecone key + index + dimension. */
systemRouter.get(
  "/pinecone-test",
  asyncRoute(async (_req, res, next) => {
    try {
      const result = await runPineconeSelfTest();
      res.status(result.ok ? 200 : 422).json(result);
    } catch (e) {
      next(e);
    }
  })
);
