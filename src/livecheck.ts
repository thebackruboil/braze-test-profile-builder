#!/usr/bin/env node
// Phase 2 live check. Run from a machine that can reach Braze:
//   npm run build && node --env-file=.env dist/livecheck.js
// Creates one synthetic profile, reads it back from Braze, then deletes it.
// Leaves nothing behind. Aborts loudly on any failure.

import { loadConfig } from "./config.js";
import { BrazeClient } from "./braze.js";
import { createProfile, deleteProfile, externalIdForEmail } from "./profiles.js";

const EMAIL = process.env.LIVECHECK_EMAIL ?? "edwin.cowork+livetest@gmail.com";

async function main() {
  const config = loadConfig();
  if (config.mock) throw new Error("BRAZE_MOCK is true. Set it to false for a live check.");
  const braze = new BrazeClient(config);

  console.log(`Braze: ${config.restUrl}`);
  console.log(`\n1) create opted_in profile for ${EMAIL} ...`);
  const created = await createProfile(
    { email: EMAIL, mode: "opted_in", preset: "abo-active-newsletter-optin" },
    config,
    braze,
  );
  console.log("   created:", JSON.stringify(created));

  console.log("\n2) read it back from Braze ...");
  const exported = await braze.exportByExternalIds(
    [externalIdForEmail(EMAIL)],
    ["external_id", "email", "email_subscribe", "custom_attributes"],
  );
  console.log(`   status ${exported.status}:`, JSON.stringify(exported.body));
  if (!exported.ok) throw new Error("Export failed. Check the key scope includes users.export.ids.");

  console.log("\n3) delete to clean up ...");
  const deleted = await deleteProfile(EMAIL, config, braze);
  console.log("   deleted:", JSON.stringify(deleted));

  console.log("\nLive check passed. Create, read-back, and delete all work against Braze.");
}

main().catch((err) => {
  console.error("\nLive check FAILED:", err);
  process.exit(1);
});
