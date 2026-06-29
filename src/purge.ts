#!/usr/bin/env node
// Standalone purge entrypoint for the scheduled cron (GitHub Actions).
// Deletes every test profile past its expiry. Reads the same ledger as the MCP server.

import { loadConfig } from "./config.js";
import { BrazeClient } from "./braze.js";
import { expiredEntries, recordDeleted } from "./ledger.js";

async function main() {
  const config = loadConfig();
  const braze = new BrazeClient(config);
  const expired = expiredEntries();

  console.error(`[purge] ${expired.length} expired test profile(s) found (mock=${config.mock}).`);

  let deleted = 0;
  for (const e of expired) {
    const res = await braze.deleteByExternalId([e.externalId]);
    if (res.ok) {
      recordDeleted(e.externalId);
      deleted++;
      console.error(`[purge] deleted ${e.externalId} (${e.email})`);
    } else {
      console.error(`[purge] FAILED ${e.externalId}: ${res.status} ${JSON.stringify(res.body)}`);
    }
  }

  console.error(`[purge] done. Deleted ${deleted}/${expired.length}.`);
}

main().catch((err) => {
  console.error("[purge] fatal:", err);
  process.exit(1);
});
