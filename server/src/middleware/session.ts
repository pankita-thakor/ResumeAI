import type { Request, Response, NextFunction } from "express";
import { Session } from "../models/Session.js";

export interface SessionRequest extends Request {
  session?: any;
}

/**
 * The id is opaque to the server — it only ever identifies one browser's workspace, never a
 * person — so the shape check exists to keep junk out of the collection, not to authorise.
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Resolve `X-Session-Id` to its workspace document, creating it on first use.
 *
 * Upserting here means a fresh browser needs no signup round-trip: its first upload or chat
 * message brings the workspace into existence.
 */
export const session = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
) => {
  const sessionId = req.header("X-Session-Id")?.trim();

  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    res.status(400).json({
      error:
        "Missing or malformed X-Session-Id header. Reload the page to get a new session.",
    });
    return;
  }

  try {
    req.session = await Session.findOneAndUpdate(
      { sessionId },
      { $setOnInsert: { sessionId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    next();
  } catch (err) {
    next(err);
  }
};
