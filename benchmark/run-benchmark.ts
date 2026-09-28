#!/usr/bin/env node
/**
 * Benchmark harness: runs the same task fixtures through every configured
 * provider/model candidate and reports latency, schema validity, and
 * task-specific correctness. This is what answers "which model is best for
 * job extraction / cheapest / fastest / hallucinates least" - see
 * docs/benchmarks.md.
 *
 * Usage:
 *   npm run benchmark                                   # all tasks, all configured candidates
 *   npm run benchmark -- --task talentsquad.extract_job
 *   npm run benchmark -- --models openai/gpt-4o-mini,mock/mock-structured-v1
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config/env.js";
import { InferenceService } from "../src/inference/inference-service.js";
import { GatewayError } from "../src/inference/errors.js";
import { MockProvider } from "../src/providers/mock/mock-provider.js";
import { buildProviderRegistry } from "../src/providers/registry.js";
import { getRoute } from "../src/router/route-config.js";
import { getTask, listTasks } from "../src/tasks/registry.js";
import { ContentLog, EvaluationStore, appendJsonlRecord } from "../src/telemetry/evaluation-store.js";
import { Logger } from "../src/telemetry/logger.js";
import { assessExtractJob } from "./assertions/talentsquad-extract-job.js";
import { assessExplainConditions } from "./assertions/anglerj-explain-conditions.js";
import type { AssertionResult } from "./assertions/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ASSESSORS: Record<string, (fixture: { id: string; input: unknown; [k: string]: unknown }, output: unknown) => AssertionResult> = {
  "talentsquad.extract_job": assessExtractJob as never,
  "anglerj.explain_conditions": assessExplainConditions as never,
};

function slugForTask(taskId: string): string {
  return taskId.replace(/\./g, "-").replace(/_/g, "-");
}

interface CliArgs {
  task?: string;
  models?: Array<{ provider: string; model: string }>;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--task") args.task = argv[++i];
    if (argv[i] === "--models") {
      args.models = (argv[++i] ?? "").split(",").filter(Boolean).map((pair) => {
        const [provider, model] = pair.split("/");
        return { provider: provider ?? "", model: model ?? "" };
      });
    }
  }
  return args;
}

function loadFixtures(taskId: string): Array<{ id: string; input: unknown; [key: string]: unknown }> {
  const dir = join(__dirname, "fixtures", slugForTask(taskId));
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")));
}

interface Aggregate {
  provider: string;
  model: string;
  runs: number;
  successes: number;
  schemaValidCount: number;
  schemaApplicable: number;
  totalLatencyMs: number;
  totalScore: number;
  totalMaxScore: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const providers = buildProviderRegistry(config);
  // Mock is never part of a task's production route (see route-config.ts), so
  // it never shows up here via buildProviderRegistry unless ENABLE_MOCK_PROVIDER
  // is set. The benchmark harness is an explicit-selection context - `--models
  // mock/...` should always work regardless of that flag - so it's added here
  // unconditionally, independent of production config.
  if (!providers.has("mock")) {
    providers.set("mock", new MockProvider());
  }
  const evaluationStore = new EvaluationStore();
  const contentLog = new ContentLog(false);
  const logger = new Logger("warn");
  const inferenceService = new InferenceService(providers, evaluationStore, contentLog, logger);

  const taskIds = args.task ? [args.task] : listTasks().map((t) => t.id);
  const resultsPath = join(__dirname, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  const aggregates = new Map<string, Aggregate>();

  for (const taskId of taskIds) {
    const task = getTask(taskId);
    const assess = ASSESSORS[taskId];
    if (!assess) {
      console.warn(`No benchmark assessor registered for "${taskId}" - skipping.`);
      continue;
    }

    const route = getRoute(taskId);
    if (!route) {
      console.warn(`No route configured for "${taskId}" - skipping.`);
      continue;
    }

    const candidates = args.models ?? [route.primary, ...route.fallback];
    const fixtures = loadFixtures(taskId);

    console.log(`\n=== ${taskId} (${fixtures.length} fixture(s)) ===`);

    for (const candidate of candidates) {
      const provider = providers.get(candidate.provider);
      if (!provider) {
        console.warn(`  skipping unknown provider "${candidate.provider}"`);
        continue;
      }
      if (!provider.isConfigured()) {
        console.log(`  skipping ${candidate.provider}/${candidate.model} (not configured)`);
        continue;
      }

      const aggKey = `${candidate.provider}/${candidate.model}`;
      const agg: Aggregate = aggregates.get(aggKey) ?? {
        provider: candidate.provider,
        model: candidate.model,
        runs: 0,
        successes: 0,
        schemaValidCount: 0,
        schemaApplicable: 0,
        totalLatencyMs: 0,
        totalScore: 0,
        totalMaxScore: 0,
      };

      for (const fixture of fixtures) {
        agg.runs += 1;
        const startedAt = Date.now();
        try {
          const result = await inferenceService.run({
            taskId,
            input: fixture.input,
            override: candidate,
          });
          const latencyMs = Date.now() - startedAt;
          const assessment = assess(fixture, result.result);

          agg.successes += 1;
          agg.totalLatencyMs += latencyMs;
          agg.totalScore += assessment.score;
          agg.totalMaxScore += assessment.maxScore;
          if (task.structuredOutput) {
            agg.schemaApplicable += 1;
            if (result.schemaValid) agg.schemaValidCount += 1;
          }

          appendJsonlRecord(resultsPath, {
            timestamp: new Date().toISOString(),
            requestId: result.requestId,
            task: taskId,
            fixtureId: fixture.id,
            provider: candidate.provider,
            model: candidate.model,
            promptVersion: result.promptVersion,
            latencyMs,
            success: true,
            schemaValid: result.schemaValid,
            score: assessment.score,
            maxScore: assessment.maxScore,
            details: assessment.details,
          });
        } catch (error) {
          const latencyMs = Date.now() - startedAt;
          agg.totalLatencyMs += latencyMs;
          const errorCode = error instanceof GatewayError ? error.code : "UNEXPECTED_ERROR";
          appendJsonlRecord(resultsPath, {
            timestamp: new Date().toISOString(),
            task: taskId,
            fixtureId: fixture.id,
            provider: candidate.provider,
            model: candidate.model,
            latencyMs,
            success: false,
            errorCode,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }

      aggregates.set(aggKey, agg);
    }
  }

  console.log("\n=== Summary ===");
  console.log(
    ["provider/model", "runs", "success%", "schemaValid%", "avgLatencyMs", "avgScore%"].join("\t"),
  );
  for (const agg of aggregates.values()) {
    const successPct = agg.runs > 0 ? ((agg.successes / agg.runs) * 100).toFixed(0) : "0";
    const schemaPct = agg.schemaApplicable > 0 ? ((agg.schemaValidCount / agg.schemaApplicable) * 100).toFixed(0) : "n/a";
    const avgLatency = agg.runs > 0 ? (agg.totalLatencyMs / agg.runs).toFixed(0) : "0";
    const avgScorePct = agg.totalMaxScore > 0 ? ((agg.totalScore / agg.totalMaxScore) * 100).toFixed(0) : "n/a";
    console.log(
      [`${agg.provider}/${agg.model}`, agg.runs, `${successPct}%`, `${schemaPct}%`, avgLatency, `${avgScorePct}%`].join(
        "\t",
      ),
    );
  }
  console.log(`\nFull results written to ${resultsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
