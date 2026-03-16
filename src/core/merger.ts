import Anthropic from "@anthropic-ai/sdk";
import type { AgentResult, RunMetadata } from "../types.js";
import { logger } from "../utils/logger.js";

const client = new Anthropic();

export async function merge(
  task: string,
  results: Map<string, AgentResult>,
  meta: RunMetadata
): Promise<string> {
  logger.info("merging...");

  const successful = [...results.values()].filter((r) => r.success);
  const failed = [...results.values()].filter((r) => !r.success);

  const agentOutputs = successful
    .map((r) => `## ${r.agent.toUpperCase()}\n${r.result}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `You are a synthesis agent. You receive reports from multiple specialist agents and produce
a single, unified, prioritized output.

Your output format:
1. Start with a one-line summary of the overall assessment
2. List findings grouped by severity: CRITICAL → HIGH → MEDIUM → LOW
3. Remove duplicates — if two agents flagged the same issue, merge them into one entry
4. Each finding: severity tag, short title, one-sentence description, concrete fix
5. End with a "Quick wins" section: the top 3 things to address first

Be direct. No preamble, no "based on the analysis above". Just the findings.`,
    messages: [
      {
        role: "user",
        content: `Original task: "${task}"\n\nAgent reports:\n\n${agentOutputs}`,
      },
    ],
  });

  const synthesis = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Append run metadata footer
  const footer = [
    "",
    "---",
    `*Dispatch run: ${meta.totalAgents} agents · ${meta.stages} stages · ${meta.retries} retries · ${meta.failures} failures · ${meta.totalTokens} tokens · ${(meta.totalDurationMs / 1000).toFixed(1)}s*`,
    failed.length > 0
      ? `*Failed agents: ${failed.map((r) => r.agent).join(", ")}*`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return synthesis + footer;
}
