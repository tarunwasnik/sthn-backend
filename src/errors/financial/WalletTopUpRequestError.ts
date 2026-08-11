import { FinancialError } from "./FinancialError";
export class WalletTopUpRequestError extends FinancialError { constructor(message = "Wallet top-up request failed.", code = "WALLET_TOP_UP_REQUEST_ERROR") { super(message, code); this.name = this.constructor.name; } }
