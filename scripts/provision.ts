import "dotenv/config";
import { z } from "zod";
import { db } from "../lib/db";
let [subject, email, name, role, organisation] = process.argv.slice(2);
const data = z
  .object({
    subject: z.string().min(1),
    email: z.email(),
    name: z.string().min(2),
    role: z.enum(["STUDENT", "RECIPIENT", "ADMINISTRATOR"]),
    organisation: z.string().optional(),
  })
  .parse({ subject, email, name, role, organisation });
if (process.env.AUTH_MODE !== "tidecloak")
  throw new Error(
    "Set AUTH_MODE=tidecloak before provisioning real subject mappings.",
  );
if (data.role === "RECIPIENT" && !data.organisation)
  throw new Error("Recipient organisation is required.");
await db.user.upsert({
  where: { subject: data.subject },
  create: { ...data, demo: false },
  update: { ...data, demo: false },
});
console.log(
  "Provisioned subject mapping. Matching TideCloak role is also required.",
);
await db.$disconnect();
