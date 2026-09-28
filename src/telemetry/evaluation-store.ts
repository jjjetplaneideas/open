import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Operational metadata for a single inference attempt. This is what powers
 * both production observability and the benchmark harness (docs/benchmarks.md).
 * Note there is no `input`/`output` field here by design - full content is a
 * separate, opt-in concern (see ContentLog below) so evaluating models never
 * requires storing user data by default.
 */
export interface InferenceRecord {
  requestId: string;
  task: string;
  provider: string;
  model: string;
  promptVersion: string;
  application?: string;
  latencyMs: number;
  success: boolean;
  /** null for unstructured tasks, where schema validity does not apply. */
  schemaValid: boolean | null;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  timestamp: string;
  /** Which attempt in the fallback chain this was (0 = primary). */
  attemptIndex: number;
  errorCode?: string;
}

/**
 * In-memory operational telemetry store. V1 deliberately does not ship a
 * database - see docs/production-limitations.md. Swapping this for a real
 * sink (a log pipeline, a metrics backend) means implementing this same
 * interface.
 */
export class EvaluationStore {
  private records: InferenceRecord[] = [];

  record(entry: InferenceRecord): void {
    this.records.push(entry);
  }

  list(filter?: Partial<Pick<InferenceRecord, "task" | "provider" | "model">>): InferenceRecord[] {
    if (!filter) return [...this.records];
    return this.records.filter(
      (r) =>
        (filter.task === undefined || r.task === filter.task) &&
        (filter.provider === undefined || r.provider === filter.provider) &&
        (filter.model === undefined || r.model === filter.model),
    );
  }

  clear(): void {
    this.records = [];
  }
}

/**
 * Full prompt/input/output content, kept strictly separate from operational
 * metadata. Disabled by default (see FAIR_EXCHANGE_LOG_FULL_CONTENT in
 * .env.example) - only the benchmark harness and explicitly-flagged
 * evaluation runs should enable it. Never store resumes, personal
 * employment data, or trading information here casually.
 */
export class ContentLog {
  private entries = new Map<string, { input: unknown; output: unknown }>();

  constructor(private readonly enabled: boolean) {}

  record(requestId: string, input: unknown, output: unknown): void {
    if (!this.enabled) return;
    this.entries.set(requestId, { input, output });
  }

  get(requestId: string): { input: unknown; output: unknown } | undefined {
    return this.entries.get(requestId);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

/** Appends one record as a JSON line, creating parent directories as needed. Used by the benchmark CLI to persist results outside the process. */
export function appendJsonlRecord(filePath: string, record: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}
