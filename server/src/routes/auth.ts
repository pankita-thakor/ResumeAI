import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/User.js";
import { auth, type AuthRequest } from "../middleware/auth.js";
import { jwtSecret } from "../utils/jwtSecret.js";
import { sendPasswordResetEmail } from "../services/mailer.js";

export const authRouter = Router();

// Signup
authRouter.post("/signup", async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;
    const rawPassword = req.body?.password;
    const email =
      typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const user = new User({ email, password });
    try {
      await user.save();
    } catch (saveErr: unknown) {
      const anyErr = saveErr as { code?: number; name?: string; message?: string };
      if (anyErr.code === 11000) {
        return res.status(400).json({ error: "Email already in use" });
      }
      if (anyErr.name === "ValidationError") {
        return res.status(400).json({
          error: anyErr.message || "Invalid signup data",
        });
      }
      throw saveErr;
    }

    const token = jwt.sign({ id: user._id }, jwtSecret(), { expiresIn: "7d" });

    res.status(201).json({ 
      user: { email: user.email, id: user._id, resumes: [] }, 
      token 
    });
  } catch (err) {
    // Detail stays in the server log; driver/connection errors must not reach the browser.
    // To diagnose a deploy, check the API logs and GET /api/health.
    console.error("[Signup Error]", err);
    res.status(500).json({ error: "Internal server error during signup" });
  }
});

// Login
authRouter.post("/login", async (req, res, next) => {
  try {
    const rawEmail = req.body?.email;
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const email =
      typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const isMatch = await (user as any).comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const token = jwt.sign({ id: user._id }, jwtSecret(), { expiresIn: "7d" });

    res.json({ 
      user: { email: user.email, id: user._id, resumes: user.resumes }, 
      token 
    });
  } catch (err) {
    console.error("[Login Error]", err);
    res.status(500).json({ error: "Internal server error during login" });
  }
});

// Get current user
authRouter.get("/me", auth, async (req: AuthRequest, res, next) => {
  try {
    res.json({ user: { email: req.user.email, id: req.user._id, resumes: req.user.resumes } });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

// Forgot password
authRouter.post("/forgot-password", async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Same response whether or not the account exists, so this cannot be used to
    // enumerate registered addresses.
    const genericMessage =
      "If that email is registered, a password reset link has been sent.";

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: genericMessage });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour

    await user.save();

    const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(
      /\/$/,
      ""
    );
    const resetUrl = `${clientUrl}/reset-password/${token}`;

    // Logs the link only when SMTP is unconfigured (local dev); never on a failure path
    // that would 500 and thereby reveal that the address exists.
    await sendPasswordResetEmail(user.email!, resetUrl);

    res.json({ message: genericMessage });
  } catch (err) {
    console.error("[Forgot Password Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reset password
authRouter.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Password reset token is invalid or has expired" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({ message: "Password has been reset successfully" });
  } catch (err) {
    console.error("[Reset Password Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default authRouter;
