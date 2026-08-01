/** Vision pipeline — single model + Cohere reranker (was 3-model POC ensemble). */
export const POC_VISION_MODELS = [
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
] as const;

/** True when the configured pipeline runs a single vision model (not multi-model cluster fusion). */
export function isSingleModelVisionPipeline(modelResultCount?: number): boolean {
  const count = modelResultCount ?? POC_VISION_MODELS.length;
  return POC_VISION_MODELS.length === 1 && count <= 1;
}
