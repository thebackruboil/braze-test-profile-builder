// Thin Braze REST client. Only the three endpoints this tool needs.
// Docs: https://www.braze.com/docs/api/endpoints/

import type { Config } from "./config.js";

export interface BrazeUserAttributes {
  external_id: string;
  email: string;
  // Braze reserved + custom attributes are merged in by the caller.
  [key: string]: unknown;
}

export interface SubscriptionGroupUpdate {
  subscription_group_id: string;
  subscription_state: "subscribed" | "unsubscribed";
  external_id: string;
}

export interface TrackPayload {
  attributes: BrazeUserAttributes[];
}

export interface BrazeResult {
  ok: boolean;
  status: number;
  body: unknown;
  mocked?: boolean;
}

export class BrazeClient {
  constructor(private config: Config) {}

  private async post(path: string, payload: unknown): Promise<BrazeResult> {
    if (this.config.mock) {
      // Mock mode: log instead of calling Braze. Lets the server run with no key.
      console.error(`[MOCK braze POST ${path}] ${JSON.stringify(payload)}`);
      return { ok: true, status: 200, body: { message: "success (mock)" }, mocked: true };
    }

    const res = await fetch(`${this.config.restUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    let body: unknown;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    return { ok: res.ok, status: res.status, body };
  }

  // POST /users/track  — create or update a user with attributes.
  async track(attributes: BrazeUserAttributes[]): Promise<BrazeResult> {
    return this.post("/users/track", { attributes });
  }

  // POST /subscription/status/set — set subscription group state (DOI bypass for test users).
  async setSubscriptionState(update: SubscriptionGroupUpdate): Promise<BrazeResult> {
    return this.post("/subscription/status/set", {
      subscription_group_id: update.subscription_group_id,
      subscription_state: update.subscription_state,
      external_id: [update.external_id],
    });
  }

  // POST /users/delete — hard-delete by external_id.
  async deleteByExternalId(externalIds: string[]): Promise<BrazeResult> {
    return this.post("/users/delete", { external_ids: externalIds });
  }

  // POST /users/export/ids — fetch profiles to find expired test users for the purge.
  async exportByExternalIds(externalIds: string[], fields: string[]): Promise<BrazeResult> {
    return this.post("/users/export/ids", {
      external_ids: externalIds,
      fields_to_export: fields,
    });
  }
}
