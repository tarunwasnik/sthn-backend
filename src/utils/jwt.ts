//backend/src/utils/jwt.ts


import jwt, { SignOptions } from "jsonwebtoken";

export interface AuthTokenPayload {
  id: string;
  role: "user" | "creator" | "admin";
}

export const generateToken = (payload: AuthTokenPayload): string => {
    console.log("JWT_SECRET inside generateToken =", process.env.JWT_SECRET);
    const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  const options: SignOptions = {
    expiresIn: "7d",
  };

  return jwt.sign(payload, secret, options);
};