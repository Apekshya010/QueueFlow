import type { Prisma } from "../generated/prisma/client.js";

const failedOnce = new Set<string>();

export async function sendEmailProcessor(
  payload: unknown,
  jobId: string,
): Promise<Prisma.InputJsonObject> {
  if (readFailOnce(payload) && !failedOnce.has(jobId)) {
    failedOnce.add(jobId);
    throw new Error("Simulated first-attempt failure");
  }

  const email = readEmail(payload);

  console.log(
    `Sending email for job ${jobId} to ${email.to} with subject "${email.subject}"`,
  );

  return { message: "Email sent successfully" };
}

function readFailOnce(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).failOnce === true
  );
}

function readEmail(payload: unknown): { to: string; subject: string; body: string } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Missing required field: to");
  }

  const record = payload as Record<string, unknown>;

  return {
    to: requiredText(record, "to"),
    subject: requiredText(record, "subject"),
    body: requiredText(record, "body"),
  };
}

function requiredText(payload: Record<string, unknown>, field: "to" | "subject" | "body"): string {
  const value = payload[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }

  return value;
}
