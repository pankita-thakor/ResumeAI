import { Router } from "express";
import type { Response, NextFunction } from "express";
import { GoogleGenAI, type Content } from "@google/genai";
import { auth, type AuthRequest } from "../middleware/auth.js";
import {
  resolveChatModelChain,
  shouldTryNextChatModel,
  withGeminiRetry,
} from "../utils/geminiRetry.js";

export const chatRouter = Router();

function asyncRoute(
  handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: any, res: Response, next: NextFunction) => {
    void handler(req as AuthRequest, res, next).catch(next);
  };
}

/**
 * POST /api/chat — Body: { message: string }
 * Main chatbot endpoint with memory and global resume awareness.
 */
chatRouter.post(
  "/",
  auth,
  asyncRoute(async (req, res, next) => {
    const { message } = req.body;
    const user = req.user;

    if (!message) {
      res.status(400).json({ error: "Message is required." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY not configured." });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const resumeNames = user.resumes.map((r: any) => r.name).join(", ");
    
    // System Instruction
    const systemInstruction = `You are the ResumeAI Smart Assistant. 
    You help users with their resumes and general questions.
    The user has the following resumes uploaded: [${resumeNames || "None"}].
    If the user asks to list their resumes, use this list.
    If they ask about a specific candidate, help them find the right resume.
    
    Context from previous sessions: ${user.chatSummary || "No previous history."}
    
    Be professional, helpful, and concise.`;

    // Construct contents for Gemini
    // We'll use the chatHistory + new message
    const history = user.chatHistory.map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }],
    }));

    const contents: Content[] = [
      ...history,
      { role: "user", parts: [{ text: message }] },
    ];

    const models = resolveChatModelChain();
    let responseText = "";
    let lastErr: unknown;

    for (const modelName of models) {
      try {
        const response = await withGeminiRetry(
          () =>
            ai.models.generateContent({
              model: modelName,
              contents,
              config: { systemInstruction },
            }),
          `chat(${modelName})`
        );
        responseText = response.text?.trim() ?? "";
        if (responseText) break;
      } catch (e) {
        lastErr = e;
        if (!shouldTryNextChatModel(e)) throw e;
        console.warn(`[chat] Model ${modelName} failed; trying next if any.`);
      }
    }

    if (!responseText) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error("Failed to get response from AI models.");
    }

    // Update history
    user.chatHistory.push({ role: "user", content: message });
    user.chatHistory.push({ role: "assistant", content: responseText });
    
    // Keep only last 20 messages in active history to avoid prompt bloating
    if (user.chatHistory.length > 20) {
      user.chatHistory = user.chatHistory.slice(-20);
    }

    await user.save();

    res.json({ answer: responseText });
  })
);

/**
 * POST /api/chat/summarize — Clear current history and update summary.
 * Useful on logout or manual "New Session".
 */
chatRouter.post(
  "/summarize",
  auth,
  asyncRoute(async (req, res, next) => {
    const user = req.user;
    if (user.chatHistory.length === 0) {
      res.json({ success: true, message: "No history to summarize." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY not configured." });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const fullHistory = user.chatHistory
      .map((h: any) => `${h.role}: ${h.content}`)
      .join("\n");

    const prompt = `Summarize the following chat history between a user and a ResumeAI assistant into a concise "memory" block for future sessions. Focus on what was discussed and any preferences the user showed:\n\n${fullHistory}`;

    try {
      const models = resolveChatModelChain();
      let summary = "";
      let lastErr: unknown;
      for (const modelName of models) {
        try {
          const response = await withGeminiRetry(
            () =>
              ai.models.generateContent({
                model: modelName,
                contents: prompt,
              }),
            `summarize(${modelName})`
          );
          summary = response.text?.trim() ?? "";
          if (summary) break;
        } catch (e) {
          lastErr = e;
          if (!shouldTryNextChatModel(e)) throw e;
        }
      }
      if (!summary) throw lastErr ?? new Error("Summarization failed.");

      user.chatSummary = summary;
      user.chatHistory = []; // Clear detailed history
      await user.save();

      res.json({ success: true, summary });
    } catch (err) {
      next(err);
    }
  })
);

/**
 * GET /api/chat/history — Fetch current history and summary.
 */
chatRouter.get(
  "/history",
  auth,
  asyncRoute(async (req, res, next) => {
    res.json({
      history: req.user.chatHistory,
      summary: req.user.chatSummary,
    });
  })
);
