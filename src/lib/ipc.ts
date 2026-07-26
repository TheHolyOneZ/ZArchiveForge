

import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  ArchiveInfo,
  AttackPreview,
  CheckpointMeta,
  CrackAttack,
  CrackConfig,
  CreateRequest,
  CreateResult,
  ExtractRequest,
  ExtractResult,
  ProgressMsg,
} from "./types";

export function appVersion(): Promise<string> {
  return invoke<string>("app_version");
}

export function rarCliAvailable(rarPath?: string | null): Promise<boolean> {
  return invoke<boolean>("rar_cli_available", { rarPath: rarPath || null });
}

export function createArchive(req: CreateRequest): Promise<CreateResult> {
  return invoke<CreateResult>("create_archive", { req });
}

export function extractArchive(req: ExtractRequest): Promise<ExtractResult> {
  return invoke<ExtractResult>("extract_archive", { req });
}


export function inspectArchive(path: string): Promise<ArchiveInfo> {
  return invoke<ArchiveInfo>("inspect_archive", { path });
}


export function previewAttack(attack: CrackAttack): Promise<AttackPreview> {
  return invoke<AttackPreview>("preview_attack", { attack });
}


export function startCrack(
  cfg: CrackConfig,
  onProgress: Channel<ProgressMsg>,
): Promise<string> {
  return invoke<string>("start_crack", { cfg, onProgress });
}

export function pauseJob(jobId: string): Promise<void> {
  return invoke("pause_job", { jobId });
}

export function resumeJob(
  jobId: string,
  onProgress: Channel<ProgressMsg>,
): Promise<void> {
  return invoke("resume_job", { jobId, onProgress });
}

export function cancelJob(jobId: string): Promise<void> {
  return invoke("cancel_job", { jobId });
}

export function listCheckpoints(): Promise<CheckpointMeta[]> {
  return invoke<CheckpointMeta[]>("list_checkpoints");
}

export function deleteCheckpoint(jobId: string): Promise<void> {
  return invoke("delete_checkpoint", { jobId });
}

export function clearCheckpoints(): Promise<number> {
  return invoke<number>("clear_checkpoints");
}

export { Channel };
