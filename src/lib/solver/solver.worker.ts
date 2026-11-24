import { SchoolDataset, TimetableEntry } from "@/types/timetable";
import { runTimetableSolver, SolverProgressEvent, SolverResult } from "./engine";

export type WorkerRequestMessage =
  | {
      type: "START_SOLVE";
      dataset: SchoolDataset;
      versionId: string;
      preservePinnedEntries: TimetableEntry[];
      maxOptimizationMs?: number;
      seed?: number;
    }
  | {
      type: "CANCEL_SOLVE";
    };

export type WorkerResponseMessage =
  | { type: "PROGRESS"; event: SolverProgressEvent }
  | { type: "RESULT"; result: SolverResult }
  | { type: "ERROR"; error: string };

let cancelRequested = false;

self.onmessage = (ev: MessageEvent<WorkerRequestMessage>) => {
  const msg = ev.data;
  if (msg.type === "CANCEL_SOLVE") {
    cancelRequested = true;
    return;
  }

  if (msg.type === "START_SOLVE") {
    cancelRequested = false;
    try {
      const result = runTimetableSolver(msg.dataset, {
        versionId: msg.versionId,
        preservePinnedEntries: msg.preservePinnedEntries,
        maxOptimizationMs: msg.maxOptimizationMs,
        seed: msg.seed,
        shouldCancel: () => cancelRequested,
        onProgress: (event) => {
          const out: WorkerResponseMessage = { type: "PROGRESS", event };
          self.postMessage(out);
        },
      });
      const done: WorkerResponseMessage = { type: "RESULT", result };
      self.postMessage(done);
    } catch (err) {
      const errOut: WorkerResponseMessage = {
        type: "ERROR",
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(errOut);
    }
  }
};
