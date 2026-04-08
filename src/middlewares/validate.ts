//backend/src/middlewares/validate.ts


import { ZodTypeAny } from "zod";
import { Request, Response, NextFunction } from "express";

export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    next();
  };
}
