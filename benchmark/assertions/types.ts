export interface AssertionResult {
  score: number;
  maxScore: number;
  details: string[];
}

export type AssertionFn<TFixtureInput, TOutput> = (
  fixture: { id: string; input: TFixtureInput; [key: string]: unknown },
  output: TOutput,
) => AssertionResult;
