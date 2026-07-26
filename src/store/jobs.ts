
import { create } from "zustand";
import { Channel } from "@tauri-apps/api/core";
import {
  cancelJob,
  listCheckpoints,
  pauseJob,
  resumeJob,
  startCrack,
} from "../lib/ipc";
import type { CheckpointMeta, CrackConfig, ProgressMsg } from "../lib/types";

export type JobStatus =
  | "running"
  | "paused"
  | "found"
  | "exhausted"
  | "error"
  | "cancelled";

export interface JobState {
  id: string;
  config: CrackConfig | null;
  status: JobStatus;
  tried: number;
  total: number | null;
  perSec: number;
  percent: number | null;
  elapsedMs: number;
  etaMs: number | null;

  current?: string;

  recent: string[];
  password?: string;
  error?: string;
  checkpoint?: string;
  startedAt: number;
}

const RECENT_CAP = 30;

interface JobsStore {
  jobs: Record<string, JobState>;
  order: string[];
  checkpoints: CheckpointMeta[];

  start: (config: CrackConfig) => Promise<string>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => void;
  refreshCheckpoints: () => Promise<void>;
}

function emptyJob(id: string, config: CrackConfig | null): JobState {
  return {
    id,
    config,
    status: "running",
    tried: 0,
    total: null,
    perSec: 0,
    percent: null,
    elapsedMs: 0,
    etaMs: null,
    recent: [],
    startedAt: Date.now(),
  };
}

export const useJobsStore = create<JobsStore>((set, get) => {

  function apply(msg: ProgressMsg) {
    set((s) => {
      const prev = s.jobs[msg.jobId] ?? emptyJob(msg.jobId, null);
      let next: JobState = { ...prev };
      switch (msg.event) {
        case "progress": {
          const recent =
            msg.current && msg.current !== prev.recent[prev.recent.length - 1]
              ? [...prev.recent, msg.current].slice(-RECENT_CAP)
              : prev.recent;
          next = {
            ...prev,
            status: "running",
            tried: msg.tried,
            total: msg.total,
            perSec: msg.perSec,
            percent: msg.percent,
            elapsedMs: msg.elapsedMs,
            etaMs: msg.etaMs,
            current: msg.current ?? prev.current,
            recent,
          };
          break;
        }
        case "found":
          next = { ...prev, status: "found", password: msg.password };
          break;
        case "exhausted":
          next = { ...prev, status: "exhausted" };
          break;
        case "paused":
          next = { ...prev, status: "paused", checkpoint: msg.checkpoint };
          break;
        case "error":
          next = { ...prev, status: "error", error: msg.message };
          break;
      }
      const inOrder = s.order.includes(msg.jobId);
      return {
        jobs: { ...s.jobs, [msg.jobId]: next },
        order: inOrder ? s.order : [msg.jobId, ...s.order],
      };
    });
    if (msg.event === "paused" || msg.event === "exhausted" || msg.event === "found") {
      get().refreshCheckpoints();
    }
  }

  function channel(): Channel<ProgressMsg> {
    const ch = new Channel<ProgressMsg>();
    ch.onmessage = apply;
    return ch;
  }

  return {
    jobs: {},
    order: [],
    checkpoints: [],

    async start(config) {
      const id = await startCrack(config, channel());
      set((s) => {
        const existing = s.jobs[id];
        const job = existing
          ? { ...existing, config }
          : emptyJob(id, config);
        return {
          jobs: { ...s.jobs, [id]: job },
          order: s.order.includes(id) ? s.order : [id, ...s.order],
        };
      });
      return id;
    },

    async pause(id) {
      await pauseJob(id);
    },

    async resume(id) {
      set((s) =>
        s.jobs[id]
          ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], status: "running" } } }
          : {},
      );
      await resumeJob(id, channel());
    },

    async cancel(id) {
      await cancelJob(id);
      set((s) =>
        s.jobs[id]
          ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], status: "cancelled" } } }
          : {},
      );
    },

    remove(id) {
      set((s) => {
        const jobs = { ...s.jobs };
        delete jobs[id];
        return { jobs, order: s.order.filter((x) => x !== id) };
      });
    },

    async refreshCheckpoints() {
      try {
        const cps = await listCheckpoints();
        set({ checkpoints: cps });
      } catch {

      }
    },
  };
});
