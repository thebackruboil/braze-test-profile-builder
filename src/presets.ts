// Preset loader. Presets live in presets.json at the repo root so non-engineers
// can edit them without touching TypeScript.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Preset {
  description: string;
  attributes: Record<string, unknown>;
}

export interface PresetFile {
  presets: Record<string, Preset>;
}

let cache: PresetFile | null = null;

export function loadPresets(): PresetFile {
  if (cache) return cache;
  // dist/ -> repo root is one level up. Falls back to cwd for ts-node/dev runs.
  const candidates = [
    join(__dirname, "..", "presets.json"),
    join(process.cwd(), "presets.json"),
  ];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      cache = JSON.parse(raw) as PresetFile;
      return cache;
    } catch {
      // try next
    }
  }
  throw new Error("presets.json not found next to the binary or in the working directory.");
}

export function getPreset(name: string): Preset {
  const { presets } = loadPresets();
  const preset = presets[name];
  if (!preset) {
    const available = Object.keys(presets).join(", ") || "(none)";
    throw new Error(`Unknown preset "${name}". Available presets: ${available}`);
  }
  return preset;
}

export function listPresetNames(): string[] {
  return Object.keys(loadPresets().presets);
}
