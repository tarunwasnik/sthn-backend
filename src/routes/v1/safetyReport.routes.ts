import { Router } from "express"; import { protect } from "../../middlewares/auth.middleware"; import { createSafetyReport, getSafetyReport, listSafetyReports } from "../../controllers/safetyReport.controller";
const router=Router(); router.post("/",protect,createSafetyReport); router.get("/",protect,listSafetyReports); router.get("/:reportId",protect,getSafetyReport); export default router;
