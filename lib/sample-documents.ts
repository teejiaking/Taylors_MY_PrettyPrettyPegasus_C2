export function samplePdfBytes(title: string, lines: string[]) {
  const safe = (s: string) =>
    s.replace(/[^\x20-\x7e]/g, "-").replace(/[()\\]/g, "\\$&");
  const content = `BT /F1 22 Tf 55 760 Td (${safe("TRUSTVAULT / SYNTHETIC SAMPLE")}) Tj /F1 14 Tf 0 -40 Td (${safe(title)}) Tj /F1 11 Tf ${lines.map((s) => `0 -25 Td (${safe(s)}) Tj`).join(" ")} 0 -55 Td (DEMONSTRATION ONLY - NOT A VALID DOCUMENT) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(content).byteLength} >>\nstream\n${content}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(new TextEncoder().encode(out).byteLength);
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = new TextEncoder().encode(out).byteLength;
  out += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(out);
}
export const syntheticSamples: Array<{
  id: string;
  title: string;
  kind: string;
  attributes: Record<string, string>;
}> = [
  {
    id: "doc-enrolment",
    title: "Student enrolment certificate",
    kind: "enrolment",
    attributes: {
      fullName: "Maya Chen",
      studentId: "SYN-2026-0842",
      enrolmentStatus: "Currently enrolled",
      course: "Bachelor of Design",
    },
  },
  {
    id: "doc-passport",
    title: "Passport demonstration document",
    kind: "passport",
    attributes: {
      passportNumber: "SYN-P0000842",
      homeAddress: "42 Example Lane, Demo City",
    },
  },
  {
    id: "doc-insurance",
    title: "Student insurance certificate",
    kind: "insurance",
    attributes: {
      insurancePolicyNumber: "SYN-INS-00842",
      insuranceStatus: "Active synthetic coverage",
    },
  },
];
