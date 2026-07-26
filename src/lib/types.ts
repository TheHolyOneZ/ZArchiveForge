

export type ArchiveFormat = "zip" | "sevenz" | "rar";
export type EncScheme = "none" | "aes256";
export type CompressionLevel = "store" | "fast" | "normal" | "best";

export interface CreateRequest {
  inputs: string[];
  output: string;
  format: ArchiveFormat;
  encryption: EncScheme;
  level: CompressionLevel;
  password: string | null;

  rarPath?: string | null;
}

export interface CreateResult {
  output: string;
  files: number;
  bytes: number;
}


export interface ExtractRequest {
  archive: string;
  dest: string;
  password: string | null;
}

export interface ExtractResult {
  dest: string;
  files: number;
  bytes: number;
}

export const FORMAT_EXT: Record<ArchiveFormat, string> = {
  zip: "zip",
  sevenz: "7z",
  rar: "rar",
};

export const FORMAT_LABEL: Record<ArchiveFormat, string> = {
  zip: "ZIP",
  sevenz: "7z",
  rar: "RAR",
};


export interface ArchiveEntryInfo {
  name: string;
  size: number;
  encrypted: boolean;
}

export interface ArchiveInfo {
  format: ArchiveFormat;

  encrypted: boolean;

  scheme: string | null;

  crackable: boolean;
  entries: ArchiveEntryInfo[];
}

export type CrackAttack =
  | { kind: "dictionary"; wordlist: string }
  | { kind: "mask"; pattern: string }
  | { kind: "bruteforce"; charset: string; minLen: number; maxLen: number };

export interface CrackConfig {
  archive: string;

  entry: string | null;
  attack: CrackAttack;

  threads: number | null;
}

export interface AttackPreview {
  total: number | null;
  samples: string[];
  truncated: boolean;
}

export type ProgressMsg =
  | {
      event: "progress";
      jobId: string;
      tried: number;
      total: number | null;
      perSec: number;
      percent: number | null;
      elapsedMs: number;
      etaMs: number | null;
      current: string | null;
    }
  | { event: "found"; jobId: string; password: string }
  | { event: "exhausted"; jobId: string }
  | { event: "paused"; jobId: string; checkpoint: string }
  | { event: "error"; jobId: string; message: string };

export interface CheckpointMeta {
  jobId: string;
  archive: string;
  attack: CrackAttack;
  tried: number;
  createdAt: number;
}


export const CHARSET_PRESETS: { id: string; label: string; chars: string }[] = [
  { id: "lower", label: "a-z", chars: "abcdefghijklmnopqrstuvwxyz" },
  { id: "upper", label: "A-Z", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  { id: "digits", label: "0-9", chars: "0123456789" },
  { id: "symbols", label: "!@#…", chars: "!@#$%^&*()-_=+[]{};:,.<>?/|~" },
  { id: "space", label: "space", chars: " " },
];

