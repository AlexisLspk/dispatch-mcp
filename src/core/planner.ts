import Anthropic from "@anthropic-ai/sdk";
import { AGENT_REGISTRY } from "../agents/registry.js";
import type { ExecutionPlan, PlanNode } from "../types.js";
import { logger } from "../utils/logger.js";
import { getCachedPlan, setCachedPlan } from "../memory/plan-cache.js";

const client = new Anthropic();

export async function plan(task: string): Promise<ExecutionPlan> {
  const cached = await getCachedPlan(task);
  if (cached) return cached;

  logger.info("planning...");

  const agentDescriptions = AGENT_REGISTRY.map(
    (a) => `- ${a.name}: ${a.description}`
  ).join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: `You are a planning agent for a multi-agent system. Given a task and available specialist agents,
output a JSON array of execution nodes. Each node must have:
  - "id": unique short string (e.g. "node_1")
  - "agentName": exactly one of the available agent names
  - "dependsOn": array of node ids that must complete BEFORE this node starts (use [] for nodes that can run immediately)
  - "instruction": a specific, focused instruction for this agent

Rules:
- Only include agents that are genuinely relevant to the task
- Use "dependsOn" to express real data dependencies (e.g. a synthesis node depends on analysis nodes)
- Prefer parallel execution (empty dependsOn) unless there's a true dependency
- Keep it minimal — don't spawn agents just to look thorough
- Return ONLY a valid JSON array. No markdown fences, no explanation, no preamble.`,
    messages: [
      {
        role: "user",
        content: `Task: "${task}"\n\nAvailable agents:\n${agentDescriptions}`,
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

  let nodes: PlanNode[];
  try {
    nodes = JSON.parse(raw);
  } catch {
    logger.error("Planner returned invalid JSON", { raw });
    throw new Error("Planner failed to return a valid execution plan.");
  }

  logger.info(
    `plan ready — ${nodes.length} agents, routing to [${nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.agentName).join("] [")}]`
  );

  const executionPlan: ExecutionPlan = { task, nodes };
  await setCachedPlan(task, executionPlan);
  return executionPlan;
}

// Render an ASCII DAG for the nexus_plan tool
export function renderPlanAsTree(plan: ExecutionPlan): string {
  const lines: string[] = [`Execution plan for: "${plan.task}"`, ""];

  // Group nodes by stage
  const stages: PlanNode[][] = [];
  const resolved = new Set<string>();
  const remaining = [...plan.nodes];

  while (remaining.length > 0) {
    const stage = remaining.filter((n) =>
      n.dependsOn.every((dep) => resolved.has(dep))
    );
    if (stage.length === 0) break;
    stages.push(stage);
    stage.forEach((n) => {
      resolved.add(n.id);
      remaining.splice(remaining.indexOf(n), 1);
    });
  }

  stages.forEach((stage, i) => {
    const depLabel = i === 0 ? "(parallel)" : `(depends on stages 1..${i})`;
    lines.push(`Stage ${i + 1} ${depLabel}`);
    stage.forEach((n) => {
      lines.push(`  ├── [${n.agentName}] ${n.instruction.slice(0, 80)}${n.instruction.length > 80 ? "…" : ""}`);
    });
    if (i < stages.length - 1) lines.push("  │");
  });

  return lines.join("\n");
}
