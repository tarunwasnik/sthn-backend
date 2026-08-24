// backend/src/models/userProfile.model.ts

import mongoose, { Schema, Document } from "mongoose";

export type ProfileStatus =
  | "incomplete"
  | "pending_verification"
  | "verified"
  | "rejected";

export interface UserProfileDocument extends Document {
  userId: mongoose.Types.ObjectId;

  username: string;
  realName?: string | null;
  dateOfBirth: Date;

  country?: string | null;
  city?: string | null;
  languages: string[];

  interests: string[];
  bio: string;

  avatar: string;
  cover: string;

  profilePhotos: string[];

  profileStatus: ProfileStatus;
  rejectionReason: string;

  verificationSubmittedAt?: Date;
  verificationSubmissionVersion: number;

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

    realName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },

    dateOfBirth: {
      type: Date,
      required: function (this: UserProfileDocument) { return this.profileStatus !== "incomplete"; },
    },

    country: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },

    city: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100,
    },

    languages: {
      type: [String],
      default: [],
    },

    interests: {
      type: [String],
      default: [],
    },

    bio: {
      type: String,
      required: function (this: UserProfileDocument) { return this.profileStatus !== "incomplete"; },
      trim: true,
    },

    avatar: {
      type: String,
      required: function (this: UserProfileDocument) { return this.profileStatus !== "incomplete"; },
    },

    cover: {
      type: String,
      required: function (this: UserProfileDocument) { return this.profileStatus !== "incomplete"; },
    },

    profilePhotos: {
      type: [String],
      validate: {
        validator: function (value: string[]) {
          return (this as UserProfileDocument).profileStatus === "incomplete" || (value.length >= 2 && value.length <= 6);
        },
        message: "Gallery must contain between 2 and 6 images",
      },
      required: function (this: UserProfileDocument) { return this.profileStatus !== "incomplete"; },
    },

    profileStatus: {
      type: String,
      enum: ["incomplete", "pending_verification", "verified", "rejected"],
      default: "incomplete",
      index: true,
    },

    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    verificationSubmittedAt: {
      type: Date,
      default: null,
      index: true,
    },
    verificationSubmissionVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

export const UserProfile = mongoose.model<UserProfileDocument>(
  "UserProfile",
  UserProfileSchema,
);
