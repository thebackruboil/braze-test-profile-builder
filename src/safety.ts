// Test-only safety lock. This is the hard guardrail that keeps the tool from
// ever touching a real customer profile. Enforced in code, not in docs.
//
// Two independent checks, both must pass before any write/delete:
//   1. The email must match the allowlist regex (synthetic/test addresses only).
//   2. Every profile this tool creates carries is_test=true. Deletes are scoped
//      to addresses that pass check (1), so a real customer email can never be
//      passed through even by mistake.

import type { Config } from "./config.js";

export const TEST_TAG_ATTRIBUTE = "is_test";

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafetyError";
  }
}

export function assertAllowedEmail(email: string, config: Config): void {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) {
    throw new SafetyError("No email provided.");
  }
  if (!normalized.includes("@")) {
    throw new SafetyError(`"${email}" is not a valid email.`);
  }
  if (!config.allowlistRegex.test(normalized)) {
    throw new SafetyError(
      `Refusing to operate on "${email}". It does not match the test-email allowlist ` +
        `(${config.allowlistRegex.source}). This tool only touches synthetic test profiles. ` +
        `If this really is a test address, widen TEST_EMAIL_ALLOWLIST_REGEX.`,
    );
  }
}
