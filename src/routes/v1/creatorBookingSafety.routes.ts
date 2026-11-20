import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware";
import { requireActiveCreator } from "../../middlewares/creator.middleware";
import { blockCustomer, getMyBookingSafety, unblockCustomer, updateMyBookingAvailability } from "../../controllers/creatorBookingSafety.controller";

const router = Router();
router.use(protect, requireActiveCreator);
router.get("/booking-safety", getMyBookingSafety);
router.patch("/booking-safety", updateMyBookingAvailability);
router.post("/blocked-customers/:customerId", blockCustomer);
router.delete("/blocked-customers/:customerId", unblockCustomer);
export default router;
