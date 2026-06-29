// Core logic: compose a complete target profile and write it to Braze in one go.
// This is the part that kills the "create user -> wait for DOI -> re-upload CSV"
// loop: identity + subscription state + attributes go in a single track call.

import type { Config } from "./config.js";
import { BrazeClient } from "./braze.js";
import { assertAllowedEmail, TEST_TAG_ATTRIBUTE } from "./safety.js";
import { getPreset } from "./presets.js";

export type ProfileMode = "fresh" | "opted_in";

export interface CreateProfileInput {
  email: string;
  mode: ProfileMode;
  preset?: string;
  attributes?: Record<string, unknown>;
  externalId?: string;
}

export interface CreateProfileResult {
  externalId: string;
  email: string;
  mode: ProfileMode;
  expiresAt: string;
  attributesApplied: Record<string, unknown>;
  subscriptionSet: boolean;
  mocked: boolean;
}

function isoNow(): string {
  return new Date().toISOString();
}

function expiryFromNow(ttlDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ttlDays);
  return d.toISOString();
}

// Deterministic external_id from the email keeps creation idempotent and makes
// the profile easy to find again for deletion.
export function externalIdForEmail(email: string): string {
  return "test_" + email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export async function createProfile(
  input: CreateProfileInput,
  config: Config,
  braze: BrazeClient,
): Promise<CreateProfileResult> {
  assertAllowedEmail(input.email, config);

  const externalId = input.externalId ?? externalIdForEmail(input.email);
  const expiresAt = expiryFromNow(config.ttlDays);

  // Merge preset attributes (if any) under explicit overrides.
  const presetAttrs = input.preset ? getPreset(input.preset).attributes : {};
  const merged: Record<string, unknown> = {
    ...presetAttrs,
    ...(input.attributes ?? {}),
  };

  // Reserved markers the tool always controls. These cannot be overridden.
  merged[TEST_TAG_ATTRIBUTE] = true;
  merged.test_created_at = isoNow();
  merged.test_expires_at = expiresAt;
  merged.test_mode = input.mode;

  const optIn = input.mode === "opted_in";

  // Braze reserved email subscription field. For opted_in we set the state
  // directly, which is the legitimate way to reach the state under test for a
  // synthetic user without the DOI round-trip. For fresh, leave it unset so the
  // user behaves like a brand-new signup and any real DOI journey can fire.
  const attributePayload: Record<string, unknown> = {
    external_id: externalId,
    email: input.email,
    _update_existing_only: false,
    ...merged,
  };
  if (optIn) {
    attributePayload.email_subscribe = "opted_in";
  }

  const trackRes = await braze.track([attributePayload as any]);
  if (!trackRes.ok) {
    throw new Error(`Braze track failed (${trackRes.status}): ${JSON.stringify(trackRes.body)}`);
  }

  // Subscription group opt-in (separate endpoint). Only for opted_in mode and
  // only if a group id is configured.
  let subscriptionSet = false;
  if (optIn && config.newsletterSubscriptionGroupId) {
    const subRes = await braze.setSubscriptionState({
      subscription_group_id: config.newsletterSubscriptionGroupId,
      subscription_state: "subscribed",
      external_id: externalId,
    });
    if (!subRes.ok) {
      throw new Error(
        `Braze subscription set failed (${subRes.status}): ${JSON.stringify(subRes.body)}`,
      );
    }
    subscriptionSet = true;
  }

  return {
    externalId,
    email: input.email,
    mode: input.mode,
    expiresAt,
    attributesApplied: merged,
    subscriptionSet,
    mocked: Boolean(trackRes.mocked),
  };
}

export async function deleteProfile(
  email: string,
  config: Config,
  braze: BrazeClient,
): Promise<{ externalId: string; deleted: boolean; mocked: boolean }> {
  // Safety lock applies to deletes too: a real customer email can never be passed through.
  assertAllowedEmail(email, config);
  const externalId = externalIdForEmail(email);
  const res = await braze.deleteByExternalId([externalId]);
  if (!res.ok) {
    throw new Error(`Braze delete failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { externalId, deleted: true, mocked: Boolean(res.mocked) };
}
