// backend/src/types/express.d.ts

import { Role } from "../constants/roles";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        status: string; // lifecycle state
      };
    }
  }
}

export {};