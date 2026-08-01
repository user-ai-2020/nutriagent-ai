import path from "node:path";
import { formatI18nUsageReport, validateI18nUsage } from "./validateUsage";

const repoRoot = path.resolve(__dirname, "../../../..");
const report = validateI18nUsage(repoRoot);

console.log(formatI18nUsageReport(report));

if (!report.ok) {
  process.exit(1);
}
