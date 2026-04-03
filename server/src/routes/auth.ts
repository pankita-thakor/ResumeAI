import { Router } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { auth, type AuthRequest } from "../middleware/auth.js";

export const authRouter = Router();

// Signup
authRouter.post("/signup", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const user = new User({ email, password });
    await user.save();

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    res.status(201).json({ 
      user: { email: user.email, id: user._id, resumes: [] }, 
      token 
    });
  } catch (err) {
    console.error("[Signup Error]", err);
    // Return the actual error message to help debug
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error during signup" });
  }
});

// Login
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const isMatch = await (user as any).comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" }
    );

    res.json({ 
      user: { email: user.email, id: user._id, resumes: user.resumes }, 
      token 
    });
  } catch (err) {
    console.error("[Login Error]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error during login" });
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

export default authRouter;
