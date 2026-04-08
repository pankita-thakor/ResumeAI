import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { answerFromResume } from "../services/resumeQA.js";
import { extractTextFromPdf } from "../services/pdfText.js";
import { auth, type AuthRequest } from "../middleware/auth.js";

export const askRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = file.originalname?.toLowerCase() ?? "";
    const ok =
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/x-pdf" ||
      (file.mimetype === "application/octet-stream" && name.endsWith(".pdf"));
    if (!ok) {
      cb(new Error("Only PDF files are supported."));
      return;
    }
    cb(null, true);
  },
});

function asyncRoute(
  handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req as AuthRequest, res, next).catch(next);
  };
}

askRouter.post(
  "/ask",
  auth,
  asyncRoute(async (req, res, next) => {
    const body = req.body as {
      resumeText?: string;
      resumeId?: string;
      question?: string;
    };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const resumeId =
      typeof body.resumeId === "string" ? body.resumeId.trim() : "";
    const resumeText =
      typeof body.resumeText === "string" ? body.resumeText.trim() : "";

    if (!question) {
      res.status(400).json({ error: "question is required." });
      return;
    }

    if (resumeId) {
      if (!/^[a-f0-9]{64}$/.test(resumeId)) {
        res.status(400).json({
          error: "resumeId must be a 64-character hex string from POST /api/resume/index.",
        });
        return;
      }
      try {
        const { answer, meta } = await answerFromResume({
          resumeId,
          question,
          userLibrary: req.user.resumes.map((r: any) => ({ name: r.name })),
        });
        res.json({ answer, meta });
      } catch (err) {
        next(err);
      }
      return;
    }

    if (!resumeText) {
      res.status(400).json({
        error: "Provide resumeText, or resumeId after indexing (POST /api/resume/index).",
      });
      return;
    }

    try {
      const { answer, meta } = await answerFromResume({
        resumeText,
        question,
        userLibrary: req.user.resumes.map((r: any) => ({ name: r.name })),
      });
      res.json({ answer, meta });
    } catch (err) {
      next(err);
    }
  })
);

askRouter.post(
  "/ask-pdf",
  auth,
  (req, res, next) => {
    upload.single("resumePdf")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "PDF must be 5 MB or smaller." });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  asyncRoute(async (req, res, next) => {
    const question =
      typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const file = req.file;

    if (!question) {
      res.status(400).json({ error: "question is required." });
      return;
    }
    if (!file?.buffer?.length) {
      res.status(400).json({ error: "resumePdf file is required." });
      return;
    }

    try {
      const resumeText = await extractTextFromPdf(file.buffer);
      if (!resumeText) {
        res.status(400).json({
          error:
            "No text could be extracted from this PDF. It may be scanned or image-only.",
        });
        return;
      }
      const { answer, meta } = await answerFromResume({
        resumeText,
        question,
        userLibrary: req.user.resumes.map((r: any) => ({ name: r.name })),
      });
      res.json({ answer, meta });
    } catch (err) {
      next(err);
    }
  })
);
