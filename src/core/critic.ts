import Anthropic from "@anthropic-ai/sdk";
import type { AgentResult, CritiqueResult } from "../types.js";
import { logger } from "../utils/logger.js";

const client = new Anthropic();

export async function critique(
  task: string,
  results: Map<string, AgentResult>,
  attempt: number
): Promise<CritiqueResult> {
  // Hard cap on retries — prevent infinite loops
  if (attempt >= 2) {
    logger.info("critique skipped (max retries reached) — approving");
    return { approved: true, retryNodes: [], reasoning: "Max retries reached." };
  }

  logger.info("critiquing...");

  const summary = [...results.entries()]
    .map(([id, r]) => `[${id} / ${r.agent}] (${r.success ? "✓" : "✗"}):\n${r.result}`)
    .join("\n\n---\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: `You are a quality critic reviewing outputs from specialist AI agents.
Your job: decide if the outputs are sufficiently specific and actionable for the given task.

Flag an agent for retry ONLY if its output is:
- Vague or generic (no specific code locations, no concrete fixes)
- Clearly off-topic for the assigned instruction
- Extremely short with no substance

Do NOT retry agents that gave reasonable outputs, even if imperfect.
Be conservative — most outputs should be approved.

Return ONLY valid JSON:
{
  "approved": boolean,
  "retryNodes": [{ "id": string, "refinedInstruction": string }],
  "reasoning": string
}`,
    messages: [
      {
        role: "user",
        content: `Task: "${task}"\n\nAgent outputs:\n\n${summary}`,
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "");

  try {
    const parsed: CritiqueResult = JSON.parse(raw);
    if (parsed.approved) {
      logger.info("critique approved");
    } else {
      logger.warn(
        `critique rejected ${parsed.retryNodes.length} node(s) — retrying`,
        parsed.reasoning
      );
    }
    return parsed;
  } catch {
    logger.warn("Critic returned invalid JSON — approving anyway");
    return { approved: true, retryNodes: [], reasoning: "Parse error." };
  }
}
