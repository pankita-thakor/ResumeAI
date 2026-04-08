import mongoose from "mongoose";

const resumeSchema = new mongoose.Schema(
  {
    resumeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    segments: {
      type: [String],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Resume = mongoose.model("Resume", resumeSchema);
