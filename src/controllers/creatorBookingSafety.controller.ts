import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { blockCreatorCustomer, getCreatorBookingSafety, unblockCreatorCustomer, updateCreatorBookingAvailability } from "../services/creator/creatorBookingSafety.service";

export const getMyBookingSafety = catchAsync(async (req: Request, res: Response) => {
  res.status(200).json(await getCreatorBookingSafety(req.user!.id));
});

export const updateMyBookingAvailability = catchAsync(async (req: Request, res: Response) => {
  const acceptingNewBookings = await updateCreatorBookingAvailability(req.user!.id, req.body?.acceptingNewBookings);
  res.status(200).json({ acceptingNewBookings });
});

export const blockCustomer = catchAsync(async (req: Request, res: Response) => {
  await blockCreatorCustomer(req.user!.id, req.params.customerId);
  res.status(201).json({ message: "Customer blocked" });
});

export const unblockCustomer = catchAsync(async (req: Request, res: Response) => {
  await unblockCreatorCustomer(req.user!.id, req.params.customerId);
  res.status(204).send();
});
