// backend/src/models/chat.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IChat extends Document {
  bookingId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderRole: "USER" | "CREATOR";

  type:
    | "text"
    | "location"
    | "document"
    | "image"
    | "voice"
    | "video";

  message: string;

  seenBy: mongoose.Types.ObjectId[];
  aiFlags: string[];

  isDeleted: boolean;
  deletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema = new Schema<IChat>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    senderRole: {
      type: String,
      enum: ["USER", "CREATOR"],
      required: true,
    },

    type: {
      type: String,
      enum: [
        "text",
        "location",
        "document",
        "image",
        "voice",
        "video",
      ],
      default: "text",
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    seenBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    aiFlags: {
      type: [String],
      default: [],
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const Chat = mongoose.model<IChat>("Chat", ChatSchema);