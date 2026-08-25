/**
 * Server-side barrel. It re-exports Node-only modules (`image-processing` → sharp,
 * `storage/imageStorage` → @google-cloud/storage), so importing this from a client
 * component makes webpack try to bundle fs/net/child_process and the build fails.
 *
 * Browser/client code must use the subpath exports declared in package.json:
 *   @nutriagent/shared/types             (types only)
 *   @nutriagent/shared/nutrition-targets (BMI / BMR / TDEE calculations)
 *   @nutriagent/shared/citation-sources
 *   @nutriagent/shared/authCookie
 *   @nutriagent/shared/locales
 */
export * from "./types";
export * from "./vision-poc";
export * from "./image-mime";
export * from "./parse-vision-json";
export * from "./auth";
export * from "./authCookie";
export * from "./audit";
export * from "./constants";
export * from "./openrouter";
export * from "./llm-config";
export * from "./portion-estimate";
export * from "./image-processing";
export * from "./storage/imageStorage";
export * from "./vision-model-version";
export * from "./food-match";
export * from "./rag-config";
export * from "./language";
export * from "./citation-sources";
export * from "./locales";
export * from "./validateEnv";
export * from "./listen";
export * from "./nutrition-targets";
export * from "./foodDisplayName";
export * from "./aiMode";
export { createId } from "@paralleldrive/cuid2";

