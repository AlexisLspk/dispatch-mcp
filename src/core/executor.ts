import type { ExecutionPlan, AgentResult, PlanNode } from "../types.js";
import { getAgent } from "../agents/registry.js";
import { logger } from "../utils/logger.js";
import { AGENT_TIMEOUT_MS } from "../utils/constants.js";
import { getCachedAgentResult, setCachedAgentResult } from "../memory/agent-result-cache.js";

export async function execute(
  plan: ExecutionPlan,
  initialResults?: Map<string, AgentResult>
): Promise<Map<string, AgentResult>> {
  const results = new Map(initialResults ?? []);
  const pending = new Map(plan.nodes.map((n) => [n.id, n]));
  // Remove nodes already in initialResults (e.g. retry scenario)
  for (const id of results.keys()) pending.delete(id);
  let stage = 0;

  while (pending.size > 0) {
    // Find all nodes whose dependencies are already resolved
    const ready = [...pending.values()].filter((node) =>
      node.dependsOn.every((dep) => results.has(dep))
    );

    if (ready.length === 0) {
      throw new Error(
        "Circular dependency detected in execution plan — cannot proceed."
      );
    }

    stage++;
    logger.info(
      `stage ${stage} — running [${ready.map((n) => n.agentName).join("] [")}] in parallel`
    );

    // Run ready nodes in parallel
    const settled = await Promise.allSettled(
      ready.map(async (node): Promise<[string, AgentResult]> => {
        const agent = getAgent(node.agentName);
        if (!agent) {
          throw new Error(`Unknown agent "${node.agentName}" in plan node "${node.id}"`);
        }

        // Pass prior results as context if this node has dependencies
        const priorContext = node.dependsOn
          .map((dep) => {
            const r = results.get(dep);
            return r ? `[${r.agent}]:\n${r.result}` : "";
          })
          .filter(Boolean)
          .join("\n\n");

        // Check agent result cache first
        const cached = await getCachedAgentResult(
          node.agentName,
          node.instruction,
          priorContext
        );
        if (cached) {
          return [node.id, { ...cached, nodeId: node.id }];
        }

        const runWithTimeout = agent.run(node.instruction, priorContext);
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Agent timeout exceeded")), AGENT_TIMEOUT_MS)
        );
        const result = await Promise.race([runWithTimeout, timeout]);
        const resultWithId = { ...result, nodeId: node.id };
        if (result.success) {
          await setCachedAgentResult(node.agentName, node.instruction, priorContext, result);
        }
        return [node.id, resultWithId];
      })
    );

    // Commit results, remove from pending
    for (let i = 0; i < ready.length; i++) {
      const s = settled[i];
      const node = ready[i];

      if (s.status === "fulfilled") {
        const [id, result] = s.value;
        results.set(id, result);
      } else {
        logger.warn(`[${node.agentName}] failed`, s.reason);
        results.set(node.id, {
          agent: node.agentName,
          nodeId: node.id,
          result: `Agent failed: ${String(s.reason)}`,
          success: false,
          tokens: 0,
          durationMs: 0,
        });
      }

      pending.delete(node.id);
    }
  }

  return results;
}
