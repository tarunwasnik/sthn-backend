import { reloadR11Raw } from "./nudeNet320nR11Persistence";
import { analyzeNudeNetOutput } from "./nudeNet320nStageAComparison";

/** R11 postprocessing authority: reads persisted Float32 output only; never invokes ONNX. */
export const postprocessPersistedR11Raw = async (file: string, width: number, height: number) => {
  const raw = await reloadR11Raw(file);
  return { rawSha256: raw.sha256, ...analyzeNudeNetOutput(raw.values, width, height) };
};
