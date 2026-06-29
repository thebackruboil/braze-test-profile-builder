#!/usr/bin/env node
// MCP server entry. Exposes the test-profile tools over stdio.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { BrazeClient } from "./braze.js";
import { createProfile, deleteProfile, externalIdForEmail } from "./profiles.js";
import { listPresetNames, loadPresets } from "./presets.js";
import { recordCreated, recordDeleted, activeEntries, expiredEntries } from "./ledger.js";

const config = loadConfig();
const braze = new BrazeClient(config);

const server = new McpServer({
  name: "braze-test-profile-builder",
  version: "0.1.0",
});

function text(obj: unknown) {
  return { content: [{ type: "text" as const, text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

server.registerTool(
  "create_test_profile",
  {
    title: "Create test profile",
    description:
      "Create or update a synthetic Braze test profile in one call: identity, attributes, " +
      "and (for mode=opted_in) newsletter subscription state, skipping the manual DOI + CSV loop. " +
      "Only synthetic/allowlisted emails are accepted. mode=fresh leaves the user unconfirmed so a " +
      "real DOI journey can fire; mode=opted_in sets the user opted-in for testing downstream sends.",
    inputSchema: {
      email: z.string().describe("Test email. Must match the allowlist (e.g. yourbox+abo1@gmail.com)."),
      mode: z.enum(["fresh", "opted_in"]).describe("fresh = unconfirmed new signup; opted_in = ready for send tests."),
      preset: z.string().optional().describe(`Optional preset name. Available: ${listPresetNames().join(", ") || "(none)"}`),
      attributes: z.record(z.any()).optional().describe("Optional attribute overrides merged on top of the preset."),
    },
  },
  async ({ email, mode, preset, attributes }) => {
    const result = await createProfile({ email, mode, preset, attributes }, config, braze);
    recordCreated({
      externalId: result.externalId,
      email: result.email,
      mode: result.mode,
      createdAt: new Date().toISOString(),
      expiresAt: result.expiresAt,
    });
    return text(result);
  },
);

server.registerTool(
  "delete_test_profile",
  {
    title: "Delete test profile",
    description: "Hard-delete a synthetic test profile from Braze by email. Allowlist-locked.",
    inputSchema: {
      email: z.string().describe("Test email of the profile to delete. Must match the allowlist."),
    },
  },
  async ({ email }) => {
    const result = await deleteProfile(email, config, braze);
    recordDeleted(result.externalId);
    return text(result);
  },
);

server.registerTool(
  "list_test_profiles",
  {
    title: "List test profiles",
    description: "List active test profiles this tool created, with their expiry times.",
    inputSchema: {},
  },
  async () => {
    const entries = activeEntries();
    return text({ count: entries.length, profiles: entries });
  },
);

server.registerTool(
  "purge_expired",
  {
    title: "Purge expired test profiles",
    description:
      "Delete all test profiles past their expiry. Safe to call any time; the scheduled cron calls this daily.",
    inputSchema: {
      dryRun: z.boolean().optional().describe("If true, report what would be deleted without deleting."),
    },
  },
  async ({ dryRun }) => {
    const expired = expiredEntries();
    if (dryRun) {
      return text({ dryRun: true, wouldDelete: expired.length, profiles: expired });
    }
    const deleted: string[] = [];
    for (const e of expired) {
      await braze.deleteByExternalId([e.externalId]);
      recordDeleted(e.externalId);
      deleted.push(e.externalId);
    }
    return text({ deleted: deleted.length, externalIds: deleted, mock: config.mock });
  },
);

server.registerTool(
  "list_presets",
  {
    title: "List presets",
    description: "Show the available attribute presets and what each one represents.",
    inputSchema: {},
  },
  async () => text(loadPresets().presets),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`braze-test-profile-builder running (mock=${config.mock}).`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
