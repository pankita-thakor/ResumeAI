import { Router } from "express";
import type { Response } from "express";
import { session, type SessionRequest } from "../middleware/session.js";

export const sessionRouter = Router();

/** GET /api/session/me — this browser's resume library. Creates the session if new. */
sessionRouter.get("/me", session, (req: SessionRequest, res: Response) => {
  res.json({
    sessionId: req.session.sessionId,
    resumes: req.session.resumes,
  });
});
