import { Request, Response } from "express";
import { Booking } from "../models/booking.model";
import { paymentLifecycleService } from "../services/financial/paymentLifecycle.service";

/** Deliberately sandbox-only: this endpoint is not a general provider callback. */
export async function confirmRazorpaySandboxPayment(req: Request, res: Response) {
  if (!["test", "development"].includes(process.env.NODE_ENV ?? "")) return res.status(404).json({ message: "Not found" });
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const body = req.body as Record<string, unknown>;
  if (typeof body.paymentId !== "string" || typeof body.razorpayOrderId !== "string" || typeof body.razorpayPaymentId !== "string" || typeof body.razorpaySignature !== "string") return res.status(400).json({ message: "Invalid Razorpay sandbox confirmation." });
  const booking = await Booking.findById(req.params.bookingId).select("userId paymentId").exec();
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (booking.userId.toString() !== req.user.id || !booking.paymentId || booking.paymentId.toString() !== body.paymentId) return res.status(403).json({ message: "You are not allowed to confirm this payment." });
  try {
    const payment = await paymentLifecycleService.confirmRazorpaySandboxPayment({ paymentId: body.paymentId, customerId: req.user.id, orderId: body.razorpayOrderId, razorpayPaymentId: body.razorpayPaymentId, signature: body.razorpaySignature });
    return res.status(200).json({ payment: { id: String(payment._id), status: payment.status, provider: payment.provider } });
  } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Razorpay sandbox confirmation failed." }); }
}
