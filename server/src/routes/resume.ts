import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { indexResumeToPinecone } from "../services/resumeEmbeddings.js";
import { extractTextFromPdf } from "../services/pdfText.js";

export const resumeRouter = Router();

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
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function requireGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Set GEMINI_API_KEY in server/.env to index resumes.");
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * POST /api/resume/index — body: { resumeText }
 * Chunk + embed + Pinecone upsert + session; returns { resumeId, segmentCount, embeddingModel }.
 */
resumeRouter.post(
  "/index",
  asyncRoute(async (req, res, next) => {
    const resumeText =
      typeof req.body?.resumeText === "string" ? req.body.resumeText : "";
    if (!resumeText.trim()) {
      res.status(400).json({ error: "resumeText is required." });
      return;
    }

    try {
      const ai = requireGemini();
      const out = await indexResumeToPinecone(ai, resumeText);
      res.json(out);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * POST /api/resume/upload-pdf — multipart field `resumePdf` only.
 * Extract text → same indexing as /index. Returns { resumeId, segmentCount, embeddingModel }.
 */
resumeRouter.post(
  "/upload-pdf",
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
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: "resumePdf file is required." });
      return;
    }

    try {
      const resumeText = await extractTextFromPdf(file.buffer);
      if (!resumeText.trim()) {
        res.status(400).json({
          error:
            "No text could be extracted from this PDF. It may be scanned or image-only.",
        });
        return;
      }
      const ai = requireGemini();
      const out = await indexResumeToPinecone(ai, resumeText);
      res.json(out);
    } catch (err) {
      next(err);
    }
  })
);
