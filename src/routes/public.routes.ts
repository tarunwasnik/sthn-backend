
//backend/src/routes/public.routes.ts


import { Router } from "express";

import { getPublicHome } from "../controllers/public/publicHome.controller";
import { getPublicCategories } from "../controllers/public/publicCategory.controller";
import {
  getPublicCreators,
  getPublicCreatorBySlug,
} from "../controllers/public/publicCreator.controller";
import { getPublicCreatorSlots } from "../controllers/public/publicSlot.controller";

const router = Router();

/**
 * Public Home
 */
router.get("/home", getPublicHome);

/**
 * Public Categories
 */
router.get("/categories", getPublicCategories);

/**
 * Public Creators
 */
router.get("/creators", getPublicCreators);

/**
 * Public Creator Profile
 */
router.get("/creators/:slug", getPublicCreatorBySlug);

router.get("/creators/:slug/slots", getPublicCreatorSlots);

export default router;







