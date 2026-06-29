# Braze Test Profile Builder (MCP)

An MCP server that lets the CRM team spin up synthetic Braze test profiles from a
chat prompt, with subscription state and attributes set in a single API call, and
auto-expires them so they do not pile up in Braze.

It replaces the manual loop of: create user, wait for DOI in Gmail, re-upload a
CSV of attributes, then test the send.

## What it does

- **`create_test_profile`** — one call sets identity, attributes, and (for
  `opted_in`) newsletter subscription state. No DOI wait, no CSV re-upload.
  - `mode=fresh` — unconfirmed new signup, so a real DOI/onboarding journey can fire.
  - `mode=opted_in` — user is set opted-in directly, the correct end state for
    testing downstream sends and segmentation.
- **`delete_test_profile`** — hard-delete a test profile by email.
- **`list_test_profiles`** — show active test profiles and their expiry.
- **`purge_expired`** — delete everything past its TTL (the cron calls this).
- **`list_presets`** — show the named attribute bundles.

## Hard safety lock

Every write and delete is gated by `TEST_EMAIL_ALLOWLIST_REGEX`. Any address that
does not match is refused, in code. Every profile also carries `is_test=true`.
The tool cannot touch a real customer profile, even by mistake. Directly setting
`opted_in` is legitimate for synthetic users; doing it to a real user without a
genuine DOI consent record would breach UWG/GDPR, which is exactly what the lock
prevents.

## Setup

1. `npm install && npm run build`
2. Copy `.env.example` to `.env` and fill in:
   - `BRAZE_REST_URL` — your EU cluster REST endpoint (Braze > Settings > APIs and Identifiers).
   - `BRAZE_API_KEY` — a dedicated key scoped to **only** `users.track`, `users.delete`, `users.export.ids`. Do not reuse a broad production key.
   - `BRAZE_NEWSLETTER_SUBSCRIPTION_GROUP_ID` — from Braze > Subscription Groups.
   - `TEST_EMAIL_ALLOWLIST_REGEX` — tighten to your real test mailbox.
3. Run with no Braze access for a dry run: set `BRAZE_MOCK=true`.

### Register as an MCP server

Point your MCP client (Claude / Cowork) at the built binary over stdio:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/dist/index.js"],
  "env": { "BRAZE_REST_URL": "...", "BRAZE_API_KEY": "...", "BRAZE_NEWSLETTER_SUBSCRIPTION_GROUP_ID": "..." }
}
```

## Presets

Edit `presets.json` (plain JSON, no code) to match the real attribute
combinations the CRM team tests. **The shipped presets are placeholders** until
the team confirms the real Braze attribute names and values.

## Auto-expiry (the only always-on piece)

`.github/workflows/purge-expired.yml` runs daily and deletes expired test
profiles. Add these GitHub repo secrets: `BRAZE_REST_URL`, `BRAZE_API_KEY`,
`BRAZE_NEWSLETTER_SUBSCRIPTION_GROUP_ID`. Add repo variables:
`TEST_EMAIL_ALLOWLIST_REGEX`, `TEST_PROFILE_TTL_DAYS`.

### Ledger vs. Braze segment (known limitation)

Phase 1 tracks created profiles in `test-profiles-ledger.json` so `list` and
`purge` work without Braze segment exports. The cron commits ledger updates back
to the repo. This is fine for a few users. If usage grows, move the source of
truth into Braze: build a segment `is_test = true AND test_expires_at < now`,
export it via `/users/export/segment`, and delete from that. Then drop the ledger
and the commit-back step.

## Open items before production

- **Maintenance owner**: must NOT be the three CRM people. Confirm an owner
  (MarTech or whoever owns the Braze integration) before going live.
- **Braze creds + cluster URL**: needed for Phase 2 (real calls).
- **Real preset/attribute list** from the CRM team.
- **Runtime choice**: built in TypeScript. Flag now if Python is preferred.

## Status

Phase 1 complete and smoke-tested in mock mode. Phases 2 (wire to a Braze
sandbox) and 4 (handover) are pending the items above.
