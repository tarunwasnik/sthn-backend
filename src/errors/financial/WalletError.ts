import { BalanceError } from "./BalanceError";

export class WalletError extends BalanceError {
  constructor(message: string, code = "WALLET_ERROR", cause?: unknown) {
    super(message, code, { cause });
    this.name = this.constructor.name;
  }
}
