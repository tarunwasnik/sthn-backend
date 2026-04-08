//backend/src/validations/user.validation.ts


import { z } from "zod";

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
  }),
});
