// backend/src/models/chat.model.ts

import mongoose, { Schema, Document } from "mongoose";

interface IReaction {
  userId: mongoose.Types.ObjectId;
  emoji: string;
}

interface ILocation {
  latitude: number;
  longitude: number;

  name: string;
  address: string;

  placeId?: string;
}

interface IAttachment {
  url: string;
  publicId: string;

  fileName: string;
  originalFileName: string;

  mimeType: string;
  fileSize: number;

  resourceType: "raw" | "image" | "video";
}

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

  location?: ILocation;

  attachment?: IAttachment;

  seenBy: mongoose.Types.ObjectId[];
  aiFlags: string[];

  isDeleted: boolean;
  deletedAt?: Date;

  reactions: IReaction[];

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

    location: {
      latitude: {
        type: Number,
      },

      longitude: {
        type: Number,
      },

      name: {
        type: String,
        trim: true,
      },

      address: {
        type: String,
        trim: true,
      },

      placeId: {
        type: String,
        trim: true,
      },
    },

    attachment: {
      url: {
        type: String,
        trim: true,
      },

      publicId: {
        type: String,
        trim: true,
      },

      fileName: {
        type: String,
        trim: true,
      },

      originalFileName: {
        type: String,
        trim: true,
      },

      mimeType: {
        type: String,
        trim: true,
      },

      fileSize: {
        type: Number,
      },

      resourceType: {
        type: String,
        enum: ["raw", "image", "video"],
      },
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

    reactions: {
      type: [
        {
          userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },

          emoji: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Chat = mongoose.model<IChat>(
  "Chat",
  ChatSchema
);