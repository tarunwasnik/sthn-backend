import { AppError } from "../../utils/AppError";

/** Safe operational error for trusted Internal Provider simulation commands. */
export class ProviderSimulatorError extends AppError {
  public readonly code: string;

  constructor(message: string, code: string, statusCode = 400) {
    super(message, statusCode);
    this.name = this.constructor.name;
    this.code = code;
  }
}
