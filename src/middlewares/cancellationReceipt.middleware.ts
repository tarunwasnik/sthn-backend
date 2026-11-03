import { NextFunction, Request, Response } from "express";

// This is only a provisional ingress observation. It is not a durable or
// authorized cancellation receipt until a future admission validates it.
const cancellationReceipt = Symbol("cancellationReceipt");
type ReceiptRequest = Request & { [cancellationReceipt]?: number };

export function captureCancellationReceipt(req: Request, _res: Response, next: NextFunction): void {
  const request = req as ReceiptRequest;
  if (request[cancellationReceipt] === undefined) {
    Object.defineProperty(request, cancellationReceipt, { value: Date.now() });
  }
  next();
}

export function getProvisionalCancellationReceipt(req: Request): Date | undefined {
  const value = (req as ReceiptRequest)[cancellationReceipt];
  return value === undefined ? undefined : new Date(value);
}
