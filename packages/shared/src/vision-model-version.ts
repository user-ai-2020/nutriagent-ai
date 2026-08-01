import { POC_VISION_MODELS } from "./vision-poc";
import { VisionAnalyzeResponse } from "./types";

export function buildVisionModelVersion(visionResult: VisionAnalyzeResponse): string {
  const rerank = visionResult.rerankModel ?? "cohere/rerank-4-fast";
  const models = POC_VISION_MODELS.map((m) => m.id).join(",");
  return `${rerank};${models}`;
}
