"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.googleLogin = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const google_auth_library_1 = require("google-auth-library");
const User_1 = __importDefault(require("../models/User"));
const roles_1 = require("../constants/roles");
const jwt_1 = require("../utils/jwt");
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
/* ================= REGISTER ================= */
const register = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }
        const existingUser = await User_1.default.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: "User already exists",
            });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await User_1.default.create({
            email,
            password: hashedPassword,
            authProvider: "local",
            role: roles_1.ROLES.USER,
            status: "pending_profile",
        });
        const token = (0, jwt_1.generateToken)({
            id: user._id.toString(),
            role: user.role,
        });
        return res.status(201).json({
            message: "User registered successfully",
            token,
            role: user.role,
            status: user.status,
        });
    }
    catch (err) {
        console.error("REGISTER ERROR:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
exports.register = register;
/* ================= LOGIN ================= */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }
        const user = await User_1.default.findOne({ email });
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
        const isMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                message: "Invalid credentials",
            });
        }
        const token = (0, jwt_1.generateToken)({
            id: user._id.toString(),
            role: user.role,
        });
        return res.json({
            token,
            role: user.role,
            status: user.status,
        });
    }
    catch (err) {
        console.error("LOGIN ERROR:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
exports.login = login;
/* ================= GOOGLE LOGIN ================= */
const googleLogin = async (req, res) => {
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
        let user = await User_1.default.findOne({ email });
        if (!user) {
            user = await User_1.default.create({
                email,
                authProvider: "google",
                googleId: sub,
                role: roles_1.ROLES.USER,
                status: "pending_profile",
            });
        }
        else {
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
        const token = (0, jwt_1.generateToken)({
            id: user._id.toString(),
            role: user.role,
        });
        return res.json({
            token,
            role: user.role,
            status: user.status,
        });
    }
    catch (err) {
        console.error("GOOGLE LOGIN ERROR:", err);
        return res.status(401).json({
            message: "Google authentication failed",
        });
    }
};
exports.googleLogin = googleLogin;
/* ================= GET CURRENT USER ================= */
const getMe = async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({
                message: "Unauthorized",
            });
        }
        const user = await User_1.default.findById(authUser.id).select("-password");
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
    }
    catch (err) {
        console.error("GET ME ERROR:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
exports.getMe = getMe;
