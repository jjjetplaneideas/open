/**
 * Both OpenAI-compatible providers (OpenAI, NVIDIA NIM) and Anthropic expose
 * a models-list endpoint shaped `{ data: [{ id: "...", ... }, ...] }`. This
 * parser is shared by every provider adapter's healthCheck() so GET /ready
 * can compare a task's routed model ID against what each provider actually
 * currently serves - see src/router/router.ts#classifyModelAvailability.
 */
export async function safeParseModelIds(response: Response): Promise<string[] | undefined> {
  try {
    const json = (await response.json()) as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(json.data)) return undefined;
    return json.data.map((entry) => entry.id).filter((id): id is string => typeof id === "string");
  } catch {
    return undefined;
  }
}
