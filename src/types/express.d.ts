// backend/src/types/express.d.ts

import { Role } from "../constants/roles";
import type { Multer } from "multer";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        status: string;
      };

      file?: Multer.File;
    }
  }
}

export {};