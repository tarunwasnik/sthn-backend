"use strict";
//backend/src/utils/jwt.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateToken = (payload) => {
    console.log("JWT_SECRET inside generateToken =", process.env.JWT_SECRET);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not defined");
    }
    const options = {
        expiresIn: "7d",
    };
    return jsonwebtoken_1.default.sign(payload, secret, options);
};
exports.generateToken = generateToken;
