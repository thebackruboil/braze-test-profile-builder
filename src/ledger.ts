// Simple local ledger of test profiles this tool created. Used by
// list_test_profiles and the purge job so we do not depend on Braze segment
// exports for Phase 1. Test emails are synthetic, not secrets.
//
// Production note: at scale, replace this with a Braze segment
// (is_test = true AND test_expires_at < now) + /users/export endpoint so the
// source of truth lives in Braze rather than a file. See README.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface LedgerEntry {
  externalId: string;
  email: string;
  mode: string;
  createdAt: string;
  expiresAt: string;
  deletedAt?: string;
}

function ledgerPath(): string {
  return process.env.LEDGER_PATH ?? join(__dirname, "..", "test-profiles-ledger.json");
}

function read(): LedgerEntry[] {
  const path = ledgerPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LedgerEntry[];
  } catch {
    return [];
  }
}

function write(entries: LedgerEntry[]): void {
  writeFileSync(ledgerPath(), JSON.stringify(entries, null, 2), "utf8");
}

export function recordCreated(entry: LedgerEntry): void {
  const entries = read().filter((e) => e.externalId !== entry.externalId);
  entries.push(entry);
  write(entries);
}

export function recordDeleted(externalId: string): void {
  const entries = read();
  const now = new Date().toISOString();
  for (const e of entries) {
    if (e.externalId === externalId) e.deletedAt = now;
  }
  write(entries);
}

export function activeEntries(): LedgerEntry[] {
  return read().filter((e) => !e.deletedAt);
}

export function expiredEntries(now = new Date()): LedgerEntry[] {
  return activeEntries().filter((e) => new Date(e.expiresAt).getTime() <= now.getTime());
}
