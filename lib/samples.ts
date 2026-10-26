import { samplePdfBytes } from "./sample-documents";
export { syntheticSamples } from "./sample-documents";
export function samplePdf(title: string, lines: string[]) {
  return Buffer.from(samplePdfBytes(title, lines));
}
