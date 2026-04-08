//backend/src/utils/adminActionError.mapper.ts


type KnownError =
  | "UNKNOWN_ACTION"
  | "VALIDATION_ERROR"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_INVALID"
  | "ACTION_BLOCKED"
  | "EXECUTION_FAILED";

export const mapAdminActionError = (err: any) => {
  const message = err?.message || "Something went wrong";

  // Default
  let code: KnownError = "EXECUTION_FAILED";

  if (message.includes("Unknown admin action")) {
    code = "UNKNOWN_ACTION";
  } else if (message.includes("requires a reason")) {
    code = "VALIDATION_ERROR";
  } else if (message.includes("validation")) {
    code = "VALIDATION_ERROR";
  } else if (message.includes("Confirmation token required")) {
    code = "CONFIRMATION_REQUIRED";
  } else if (message.includes("Confirmation token")) {
    code = "CONFIRMATION_INVALID";
  } else if (message.includes("Cannot")) {
    code = "ACTION_BLOCKED";
  }

  return {
    error: {
      code,
      message,
    },
  };
};
