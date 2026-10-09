import { Request, Response } from "express";

import { catchAsync } from "../utils/catchAsync";
import { moderateText } from "../services/textModeration/textModeration.service";

export const moderateTextContent = catchAsync(async (req: Request, res: Response) => {
  const result = await moderateText(req.body, req.user!.id);
  res.status(200).json(result);
});
