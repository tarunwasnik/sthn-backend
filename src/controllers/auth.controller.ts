//backend/src/controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import { generateToken } from "../utils/jwt";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ================= REGISTER ================= */

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword,
      authProvider: "local",
      role: ROLES.USER,
      status: "pending_profile",
    });

    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
    });

    return res.status(201).json({
      message: "User registered successfully",
      token,
      role: user.role,
      status: user.status,
    });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= LOGIN ================= */

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Account suspended. Contact support.",
      });
    }

    if (user.status === "banned") {
      return res.status(403).json({
        message: "Account permanently banned.",
      });
    }

    if (user.authProvider !== "local") {
      return res.status(400).json({
        message: "Please login using Google",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        message: "Password login not available for this account",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
    });

    return res.json({
      token,
      role: user.role,
      status: user.status,
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GOOGLE LOGIN ================= */

export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        message: "Google token required",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(400).json({
        message: "Invalid Google token",
      });
    }

    const { email, sub } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        authProvider: "google",
        googleId: sub,
        role: ROLES.USER,
        status: "pending_profile",
      });
    } else {

      if (user.authProvider === "local") {
        return res.status(400).json({
          message: "Please login using email and password",
        });
      }

      if (!user.googleId) {
        user.googleId = sub;
        await user.save();
      }
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Account suspended. Contact support.",
      });
    }

    if (user.status === "banned") {
      return res.status(403).json({
        message: "Account permanently banned.",
      });
    }

    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
    });

    return res.json({
      token,
      role: user.role,
      status: user.status,
    });

  } catch (err) {
    console.error("GOOGLE LOGIN ERROR:", err);

    return res.status(401).json({
      message: "Google authentication failed",
    });
  }
};

/* ================= GET CURRENT USER ================= */

export const getMe = async (req: Request, res: Response) => {
  try {
    const authUser = req.user;

    if (!authUser) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const user = await User.findById(authUser.id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.json({
      id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      creatorStatus: user.creatorStatus,
    });

  } catch (err) {
    console.error("GET ME ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};