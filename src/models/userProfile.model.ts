//backend/src/models/userProfile.model.ts

import mongoose, { Schema, Document } from "mongoose";

export type ProfileStatus =
  | "incomplete"
  | "pending_verification"
  | "verified"
  | "rejected";

export interface UserProfileDocument extends Document {
  userId: mongoose.Types.ObjectId;

  username: string;
  dateOfBirth: Date;

  interests: string[];
  bio: string;

  avatar: string;        // NEW
  cover: string;         // NEW

  profilePhotos: string[]; // gallery only (2–6)

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

    // ✅ NEW FIELDS
    avatar: {
      type: String,
      required: true,
    },

    cover: {
      type: String,
      required: true,
    },

    // ✅ GALLERY ONLY
    profilePhotos: {
      type: [String],
      validate: {
        validator: function (value: string[]) {
          return value.length >= 2 && value.length <= 6;
        },
        message: "Gallery must contain between 2 and 6 images",
      },
      required: true,
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