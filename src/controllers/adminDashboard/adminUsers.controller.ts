//backend/src/controllers/adminDashboard/adminUsers.controller.ts

import { Request, Response } from "express";
import { getAllUsersService } from "../../services/adminDashboard/adminUsers.service";
import { adminResponse } from "../../utils/adminResponse";
import { adminAsyncHandler } from "../../middlewares/adminAsyncHandler";


export const getAllUsers = adminAsyncHandler(
  async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const { data, total } = await getAllUsersService(page, limit);

    res.json(
  adminResponse({
    data,
    pagination: {
      page,
      limit,
      total
    }
  })
);
  }
);