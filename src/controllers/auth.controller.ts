//backend/src/controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import { generateToken } from "../utils/jwt";
import { createAuthSession } from "../services/authSession.service";
import { validateNewPassword } from "../services/auth/passwordPolicy.service";
import { AppError } from "../utils/AppError";
import { clearLoginFailures, recordFailedLogin } from "../services/auth/loginProtection.service";
import { assertPasswordNotBreached } from "../services/auth/breachedPassword.service";
import { recordVisitorTelemetry } from "../services/visitorMonitor.service";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("STHN_AUTH_TIMING_DUMMY", 10);

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};


/* ================= REGISTER ================= */

export const register = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "A valid email and password are required",
      });
    }
    validateNewPassword(password);
    await assertPasswordNotBreached(password);

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "Unable to create an account with those details",
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

    const session = await createAuthSession(String(user._id));
    const token = generateToken({ id: user._id.toString(), role: user.role, sid: String(session._id) });

    return res.status(201).json({
      message: "User registered successfully",
      token,
      role: user.role,
      status: user.status,
    });

  } catch (err) {
    if (err instanceof AppError) return res.status(err.statusCode).json({ message: err.message, code: err.code });
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= LOGIN ================= */

export const login = async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email }).select("password authProvider status role loginFailureCount loginCooldownUntil");
    const now = new Date();
    if (user?.loginCooldownUntil && user.loginCooldownUntil > now) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((user.loginCooldownUntil.getTime() - now.getTime()) / 1000))));
      return res.status(429).json({ message: "Too many attempts. Please try again later.", code: "LOGIN_COOLDOWN" });
    }

    const isMatch = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    const canAuthenticate = Boolean(user && user.authProvider === "local" && user.password && user.status !== "suspended" && user.status !== "banned" && isMatch);
    if (!canAuthenticate) {
      if (user) await recordFailedLogin(email, now);
      void recordVisitorTelemetry(req, { visitorId: typeof req.headers["x-visitor-id"] === "string" ? req.headers["x-visitor-id"] : "", type: "LOGIN_FAILED" }).catch(() => undefined);
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const authenticatedUser = user!;
    await clearLoginFailures(String(authenticatedUser._id));

    const session = await createAuthSession(String(authenticatedUser._id));
    void recordVisitorTelemetry(req, { visitorId: typeof req.headers["x-visitor-id"] === "string" ? req.headers["x-visitor-id"] : "", type: "LOGIN", accountId: String(authenticatedUser._id), role: authenticatedUser.role }).catch(() => undefined);
    const token = generateToken({ id: authenticatedUser._id.toString(), role: authenticatedUser.role, sid: String(session._id) });

    return res.json({
      token,
      role: authenticatedUser.role,
      status: authenticatedUser.status,
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

    const email = normalizeEmail(payload.email);

    if (!email || payload.email_verified !== true) {
      return res.status(400).json({
        message: "Google account email must be verified",
      });
    }

    const { sub } = payload;

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

    const session = await createAuthSession(String(user._id));
    void recordVisitorTelemetry(req, { visitorId: typeof req.headers["x-visitor-id"] === "string" ? req.headers["x-visitor-id"] : "", type: "LOGIN", accountId: String(user._id), role: user.role }).catch(() => undefined);
    const token = generateToken({ id: user._id.toString(), role: user.role, sid: String(session._id) });

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

    const user = await User.findById(authUser.id)
      .select("email role status creatorStatus authProvider");

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
      authProvider: user.authProvider,
    });

  } catch (err) {
    console.error("GET ME ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
