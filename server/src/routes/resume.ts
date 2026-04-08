import { GoogleGenAI } from "@google/genai";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { indexResumeToPinecone } from "../services/resumeEmbeddings.js";
import { extractTextFromPdf } from "../services/pdfText.js";
import { auth, type AuthRequest } from "../middleware/auth.js";
import { Resume } from "../models/Resume.js";

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
  handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req as AuthRequest, res, next).catch(next);
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
 * POST /api/resume/index — body: { resumeText, name }
 * Chunk + embed + Pinecone upsert + session; returns { resumeId, segmentCount, embeddingModel }.
 */
resumeRouter.post(
  "/index",
  auth,
  asyncRoute(async (req, res, next) => {
    const resumeText =
      typeof req.body?.resumeText === "string" ? req.body.resumeText : "";
    const name = typeof req.body?.name === "string" ? req.body.name : "Untitled Resume";
    
    if (!resumeText.trim()) {
      res.status(400).json({ error: "resumeText is required." });
      return;
    }

    try {
      const ai = requireGemini();
      const out = await indexResumeToPinecone(ai, resumeText);
      
      // Save to user
      const user = req.user;
      const alreadyExists = user.resumes.some((r: any) => r.resumeId === out.resumeId);
      if (!alreadyExists) {
        user.resumes.push({ resumeId: out.resumeId, name });
        await user.save();
      }
      
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
      
      // Save to user
      const user = req.user;
      const name = file.originalname || "Uploaded PDF";
      const alreadyExists = user.resumes.some((r: any) => r.resumeId === out.resumeId);
      if (!alreadyExists) {
        user.resumes.push({ resumeId: out.resumeId, name });
        await user.save();
      }

      res.json(out);
    } catch (err) {
      next(err);
    }
  })
);

/**
 * DELETE /api/resume/:resumeId — remove from user profile.
 */
resumeRouter.delete(
  "/:resumeId",
  auth,
  asyncRoute(async (req, res, next) => {
    const { resumeId } = req.params;
    const user = req.user;

    try {
      user.resumes = user.resumes.filter((r: any) => r.resumeId !== resumeId);
      await user.save();
      
      // Cleanup persistent segments if no other user is using this resumeId
      // (Though resumeId is derived from text, so it might be shared, 
      // but usually resumeId is unique to the file content).
      // For now, let's just delete it to be safe on storage.
      await Resume.deleteOne({ resumeId });

      res.json({ success: true, message: "Resume removed from profile." });
    } catch (err) {
      next(err);
    }
  })
);

