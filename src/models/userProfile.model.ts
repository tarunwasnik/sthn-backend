//backend/src/models/userProfile.model.ts

import mongoose, { Schema, Document } from "mongoose";

export type ProfileStatus =
  | "incomplete"
  | "pending_verification"
  | "verified"
  | "rejected";

export interface UserProfileDocument extends Document {
  userId: mongoose.Types.ObjectId;

  username: string; // public unique
  dateOfBirth: Date;

  interests: string[];
  bio: string;

  profilePhotos: string[]; // 2–6 required

  profileStatus: ProfileStatus;

  createdAt: Date;
  updatedAt: Date;
}

const UserProfileSchema = new Schema<UserProfileDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    interests: {
      type: [String],
      default: [],
    },

    bio: {
      type: String,
      required: true,
      trim: true,
    },

    profilePhotos: {
      type: [String],
      default: [],
    },

    profileStatus: {
      type: String,
      enum: ["incomplete", "pending_verification", "verified", "rejected"],
      default: "incomplete",
      index: true,
    },
  },
  { timestamps: true }
);

export const UserProfile = mongoose.model<UserProfileDocument>(
  "UserProfile",
  UserProfileSchema
);