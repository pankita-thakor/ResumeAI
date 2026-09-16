import { Router } from "express";
import type { Response, NextFunction } from "express";
import { GoogleGenAI, type Content } from "@google/genai";
import { session, type SessionRequest } from "../middleware/session.js";
import {
  resolveChatModelChain,
  shouldTryNextChatModel,
  withGeminiRetry,
} from "../utils/geminiRetry.js";

export const chatRouter = Router();

function asyncRoute(
  handler: (req: SessionRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: any, res: Response, next: NextFunction) => {
    void handler(req as SessionRequest, res, next).catch(next);
  };
}

/**
 * POST /api/chat — Body: { message: string }
 * Main chatbot endpoint with memory and global resume awareness.
 */
chatRouter.post(
  "/",
  session,
  asyncRoute(async (req, res, next) => {
    const { message } = req.body;
    const visitor = req.session;

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
    const resumeNames = visitor.resumes.map((r: any) => r.name).join(", ");
    
    // System Instruction
    const systemInstruction = `You are the ResumeAI Smart Assistant. 
    You help users with their resumes and general questions.
    The user has the following resumes uploaded: [${resumeNames || "None"}].
    If the user asks to list their resumes, use this list.
    If they ask about a specific candidate, help them find the right resume.
    
    Context from previous sessions: ${visitor.chatSummary || "No previous history."}
    
    Be professional, helpful, and concise.`;

    // Construct contents for Gemini
    // We'll use the chatHistory + new message
    const history = visitor.chatHistory.map((h: any) => ({
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
    visitor.chatHistory.push({ role: "user", content: message });
    visitor.chatHistory.push({ role: "assistant", content: responseText });

    // Keep only last 20 messages in active history to avoid prompt bloating
    if (visitor.chatHistory.length > 20) {
      visitor.chatHistory = visitor.chatHistory.slice(-20);
    }

    await visitor.save();

    res.json({ answer: responseText });
  })
);

/**
 * POST /api/chat/summarize — Clear current history and update summary.
 * Useful for a manual "New Session".
 */
chatRouter.post(
  "/summarize",
  session,
  asyncRoute(async (req, res, next) => {
    const visitor = req.session;
    if (visitor.chatHistory.length === 0) {
      res.json({ success: true, message: "No history to summarize." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY not configured." });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const fullHistory = visitor.chatHistory
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

      visitor.chatSummary = summary;
      visitor.chatHistory = []; // Clear detailed history
      await visitor.save();

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
  session,
  asyncRoute(async (req, res, next) => {
    res.json({
      history: req.session.chatHistory,
      summary: req.session.chatSummary,
    });
  })
);
