// Central config. Reads from environment. No secrets are hard-coded.

export interface Config {
  restUrl: string;
  apiKey: string;
  newsletterSubscriptionGroupId: string;
  allowlistRegex: RegExp;
  ttlDays: number;
  mock: boolean;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

export function loadConfig(): Config {
  const mock = bool(process.env.BRAZE_MOCK, false);
  const apiKey = process.env.BRAZE_API_KEY ?? "";
  const restUrl = process.env.BRAZE_REST_URL ?? "";

  // In mock mode we tolerate missing creds so the server runs without Braze.
  if (!mock) {
    if (!apiKey) throw new Error("BRAZE_API_KEY is not set (and BRAZE_MOCK is not true).");
    if (!restUrl) throw new Error("BRAZE_REST_URL is not set (and BRAZE_MOCK is not true).");
  }

  const allowlistSource =
    process.env.TEST_EMAIL_ALLOWLIST_REGEX ??
    "^[^@]+\\+[^@]+@gmail\\.com$|@test\\.roadsurfer\\.com$";

  let allowlistRegex: RegExp;
  try {
    allowlistRegex = new RegExp(allowlistSource);
  } catch (e) {
    throw new Error(`TEST_EMAIL_ALLOWLIST_REGEX is not a valid regex: ${String(e)}`);
  }

  const ttlDays = Number(process.env.TEST_PROFILE_TTL_DAYS ?? "7");
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    throw new Error("TEST_PROFILE_TTL_DAYS must be a positive number.");
  }

  return {
    restUrl: restUrl.replace(/\/+$/, ""),
    apiKey,
    newsletterSubscriptionGroupId: process.env.BRAZE_NEWSLETTER_SUBSCRIPTION_GROUP_ID ?? "",
    allowlistRegex,
    ttlDays,
    mock,
  };
}
