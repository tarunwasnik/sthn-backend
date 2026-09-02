import { writeVggFace2TierA, writeVggFace2TierB, writeVggFace2TierC } from "../evaluation/vggFace2CalibrationPreparation.service";

if (process.env.NODE_ENV === "production") throw new Error("VGGFace2 calibration preparation is development-only");
const [testRoot, manifestPath, tier = "A"] = process.argv.slice(2);
if (!testRoot || !manifestPath) throw new Error("Usage: npm run prepare:vggface2-calibration -- <test-root> <manifest.json>");

(tier === "C" ? writeVggFace2TierC(testRoot, manifestPath) : tier === "B" ? writeVggFace2TierB(testRoot, manifestPath) : writeVggFace2TierA(testRoot, manifestPath)).then((summary) => {
  console.log(JSON.stringify(summary.metadata));
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
