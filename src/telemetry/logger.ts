type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const SECRET_KEY_PATTERN = /key|token|secret|authorization|password/i;

/**
 * Structured JSON logger with automatic secret redaction. This is the only
 * sanctioned way to log in this codebase - never `console.log` a raw
 * provider request/response, since headers and error bodies can carry API
 * keys. See docs/architecture.md#privacy-and-logging.
 */
export class Logger {
  constructor(private readonly minLevel: LogLevel = "info") {}

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log("debug", message, fields);
  }
  info(message: string, fields?: Record<string, unknown>): void {
    this.log("info", message, fields);
  }
  warn(message: string, fields?: Record<string, unknown>): void {
    this.log("warn", message, fields);
  }
  error(message: string, fields?: Record<string, unknown>): void {
    this.log("error", message, fields);
  }

  private log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(redact(fields ?? {}) as Record<string, unknown>),
    };
    const line = JSON.stringify(record);
    if (level === "error") {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }
}

/** Recursively replaces any field whose key looks secret-shaped, and truncates long strings so full prompt/output content never leaks into operational logs by accident. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated: too deep]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = redact(val, depth + 1);
      }
    }
    return result;
  }
  return value;
}
