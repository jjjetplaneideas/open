import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

function boolEnv(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? defaultValue : v.toLowerCase() === "true"));
}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  GATEWAY_API_KEYS: z
    .string()
    .optional()
    .default("")
    .transform((v) => v.split(",").map((k) => k.trim()).filter(Boolean)),

  REQUEST_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(131072),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  GATEWAY_EXPOSE_PROVIDER_INFO: boolEnv(true),
  FAIR_EXCHANGE_LOG_FULL_CONTENT: boolEnv(false),

  /**
   * Mock is a test/evaluation fixture, never a production inference
   * provider of last resort. Defaults to false everywhere, including local
   * development - set it explicitly to true only when you want the "mock"
   * provider to exist in the registry and be eligible as a last-resort
   * fallback (see ENABLE_MOCK_PROVIDER in router.ts's allowMockFallback).
   * The benchmark harness does not need this flag: it can always target
   * mock explicitly regardless of this setting.
   */
  ENABLE_MOCK_PROVIDER: boolEnv(false),

  NVIDIA_NIM_API_KEY: z.string().optional().default(""),
  NVIDIA_NIM_BASE_URL: z.string().default("https://integrate.api.nvidia.com/v1"),

  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),

  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_BASE_URL: z.string().default("https://api.anthropic.com/v1"),
  ANTHROPIC_VERSION: z.string().default("2023-06-01"),
});

export type GatewayConfig = z.infer<typeof EnvSchema> & {
  isProduction: boolean;
};

let cached: GatewayConfig | undefined;

/** Parses and validates process.env once, memoized. Throws on boot if production has no API keys configured. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  if (cached) return cached;

  const parsed = EnvSchema.parse(env);
  const isProduction = parsed.NODE_ENV === "production";

  if (isProduction && parsed.GATEWAY_API_KEYS.length === 0) {
    throw new Error(
      "GATEWAY_API_KEYS must be set when NODE_ENV=production. Refusing to boot unauthenticated in production.",
    );
  }

  cached = { ...parsed, isProduction };
  return cached;
}

/** Test-only escape hatch so unit tests can exercise different env combinations without process-wide leakage. */
export function resetConfigCacheForTests(): void {
  cached = undefined;
}
