import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
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

// Hash password before saving (async hooks: do not call next — Mongoose 7+)
userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function (password: string) {
  return bcrypt.compare(password, this.password);
};

export const User = mongoose.model("User", userSchema);
