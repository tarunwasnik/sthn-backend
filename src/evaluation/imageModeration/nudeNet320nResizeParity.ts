export const R2_DIAGNOSTIC_CANDIDATES = [
  "candidate-06e0fcca6c4fdfc9",
  "candidate-01ef942c2c69fa88",
  "candidate-03e83650ace99466",
  "candidate-05453abafb9dc346",
] as const;

export const R2_SHARP_KERNELS = ["linear", "cubic", "mitchell", "lanczos2", "lanczos3"] as const;
export type R2Kernel = typeof R2_SHARP_KERNELS[number];
export type ResizeMetric = Readonly<{ kernel: R2Kernel; aggregateMae: number; differingBytes: number; perCandidateMae: readonly number[] }>;

export const selectR2ResizeKernel = (metrics: readonly ResizeMetric[]) => {
  if (metrics.length !== R2_SHARP_KERNELS.length || metrics.some((metric) => !R2_SHARP_KERNELS.includes(metric.kernel))) throw new Error("R2 requires the complete preregistered Sharp kernel set");
  const baseline = metrics.find((metric) => metric.kernel === "linear"); if (!baseline) throw new Error("R2 requires Sharp linear baseline");
  const order = new Map(R2_SHARP_KERNELS.map((kernel, index) => [kernel, index]));
  const selected = [...metrics].sort((left, right) => left.aggregateMae - right.aggregateMae || left.differingBytes - right.differingBytes || order.get(left.kernel)! - order.get(right.kernel)!)[0];
  const passes = selected.aggregateMae <= 0.25 && selected.aggregateMae <= baseline.aggregateMae * 0.25 && selected.perCandidateMae.every((value) => value <= 0.5);
  return { baseline, selected, passes };
};
