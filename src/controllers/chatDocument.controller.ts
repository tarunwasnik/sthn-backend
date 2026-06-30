//backend/src/controllers/chatDocument.controller.ts

import { Request, Response } from "express";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary";
import { Chat } from "../models/chat.model";
import { Booking } from "../models/booking.model";

export const downloadDocument = async (
  req: Request,
  res: Response
) => {
  try {
    const user = req.user;
    const { messageId } = req.params;

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        messageId
      )
    ) {
      return res.status(400).json({
        message: "Invalid messageId",
      });
    }

    const chat = await Chat.findById(
      messageId
    );

    if (!chat) {
      return res.status(404).json({
        message: "Message not found",
      });
    }

    if (
      chat.type !== "document" ||
      !chat.attachment
    ) {
      return res.status(404).json({
        message: "Document not found",
      });
    }

    const booking =
      await Booking.findById(
        chat.bookingId
      );

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found",
      });
    }

    const actorId =
      new mongoose.Types.ObjectId(
        user.id
      );

    const isUser =
      booking.userId.equals(actorId);

    const isCreator =
      booking.creatorId.equals(actorId);

    if (
      !isUser &&
      !isCreator
    ) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    const downloadUrl =
      cloudinary.url(
        chat.attachment.publicId,
        {
          resource_type: "raw",
          type: "upload",
          flags: "attachment",
        }
      );

    return res.redirect(
      downloadUrl
    );

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message:
        "Failed to download document",
    });
  }
};