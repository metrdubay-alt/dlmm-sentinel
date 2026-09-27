export interface AnalysisJob {
  id: string;
  mint: string;
  queuedAt: string;
}
/** Phase 4 implementation runs only while the app is open. */
export interface JobQueue {
  enqueue(job: AnalysisJob): Promise<void>;
  cancel(id: string): Promise<void>;
  stop(): Promise<void>;
}
