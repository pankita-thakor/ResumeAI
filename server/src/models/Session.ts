import mongoose from "mongoose";

/**
 * An anonymous visitor's workspace.
 *
 * There are no accounts: the browser mints a random id, keeps it in localStorage and sends
 * it as `X-Session-Id`. This document is what that id addresses — the resume library and
 * chat memory that used to hang off a user record.
 */
const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    resumes: [
      {
        resumeId: String,
        name: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    chatHistory: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    chatSummary: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export const Session = mongoose.model("Session", sessionSchema);
