"use strict";
// backend/src/models/chat.model.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chat = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ChatSchema = new mongoose_1.Schema({
    bookingId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Booking",
        required: true,
        index: true,
    },
    senderId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        enum: ["text", "location", "document", "image", "voice", "video"],
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
    groupId: {
        type: String,
        trim: true,
        default: null,
        index: true,
    },
    replyTo: {
        messageId: {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "Chat",
        },
        senderId: {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: "User",
        },
        senderRole: {
            type: String,
            enum: ["USER", "CREATOR"],
        },
        type: {
            type: String,
            enum: ["text", "location", "document", "image", "voice", "video"],
        },
        message: {
            type: String,
            trim: true,
        },
        attachment: {
            url: {
                type: String,
                trim: true,
            },
            fileName: {
                type: String,
                trim: true,
            },
            mimeType: {
                type: String,
                trim: true,
            },
            resourceType: {
                type: String,
                enum: ["raw", "image", "video"],
            },
        },
    },
    seenBy: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
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
                    type: mongoose_1.Schema.Types.ObjectId,
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
}, {
    timestamps: true,
});
exports.Chat = mongoose_1.default.model("Chat", ChatSchema);
