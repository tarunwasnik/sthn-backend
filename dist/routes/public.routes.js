"use strict";
//backend/src/routes/public.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const publicHome_controller_1 = require("../controllers/public/publicHome.controller");
const publicCategory_controller_1 = require("../controllers/public/publicCategory.controller");
const publicCreator_controller_1 = require("../controllers/public/publicCreator.controller");
const publicSlot_controller_1 = require("../controllers/public/publicSlot.controller");
const router = (0, express_1.Router)();
/**
 * Public Home
 */
router.get("/home", publicHome_controller_1.getPublicHome);
/**
 * Public Categories
 */
router.get("/categories", publicCategory_controller_1.getPublicCategories);
/**
 * Public Creators
 */
router.get("/creators", publicCreator_controller_1.getPublicCreators);
/**
 * Public Creator Profile
 */
router.get("/creators/:slug", publicCreator_controller_1.getPublicCreatorBySlug);
router.get("/creators/:slug/slots", publicSlot_controller_1.getPublicCreatorSlots);
exports.default = router;
