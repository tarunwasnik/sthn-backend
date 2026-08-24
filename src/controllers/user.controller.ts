// backend/src/controllers/user.controller.ts

import { Request, Response } from "express";
import User from "../models/User";
import { UserProfile } from "../models/userProfile.model";
import { asyncHandler } from "../middlewares/asyncHandler";
import { toPublicUserProfileDto } from "../dtos/user/publicUserProfile.dto";
import { calculateAge } from "../utils/calculateAge";
import mongoose from "mongoose";

/**
 * Get all users
 * GET /api/v1/users
 */
export const getUsers = asyncHandler(
  async (_req: Request, res: Response) => {
    const users = await User.find()
      .select("email role status createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const userIds = users.map((u) => u._id);

    const profiles = await UserProfile.find({
      userId: { $in: userIds },
    })
      .select("userId username")
      .lean();

    const profileMap = new Map(
      profiles.map((p) => [p.userId.toString(), p])
    );

    res.json(
      users.map((user) => {
        const profile = profileMap.get(user._id.toString());

        return {
          id: user._id,
          email: user.email,
          role: user.role,
          status: user.status,
          username: profile?.username || null,
          createdAt: user.createdAt,
        };
      })
    );
  }
);

/**
 * ✅ NEW: Get public user profile
 * GET /api/v1/users/:userId
 */
export const getUserPublicProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid userId",
      });
    }

    const profile = await UserProfile.findOne({
      userId,
    })
      .select("username dateOfBirth avatar cover bio interests country city languages profilePhotos")
      .lean();

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      profile: toPublicUserProfileDto(profile, calculateAge),
    });
  }
);
