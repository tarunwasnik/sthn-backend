//backend/src/utils/adminError.ts

export const adminError = (
  message: string,
  code: string = "ADMIN_ERROR"
) => {
  return {
    error: {
      code,
      message
    },
    meta: {
      generatedAt: new Date().toISOString()
    }
  };
};
