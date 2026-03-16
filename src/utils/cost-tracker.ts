import type { AgentResult } from "../types.js";

interface CostEntry {
  agent: string;
  tokens: number;
  durationMs: number;
  timestamp: number;
}

const log: CostEntry[] = [];

export function recordCost(agent: string, tokens: number, durationMs: number) {
  log.push({ agent, tokens, durationMs, timestamp: Date.now() });
}

export function getTotalTokens(): number {
  return log.reduce((sum, e) => sum + e.tokens, 0);
}

export function getRunSummary(): string {
  const total = getTotalTokens();
  const byAgent = log.reduce<Record<string, number>>((acc, e) => {
    acc[e.agent] = (acc[e.agent] ?? 0) + e.tokens;
    return acc;
  }, {});

  const lines = Object.entries(byAgent).map(
    ([agent, tokens]) => `  ${agent}: ${tokens} tokens`
  );

  return [`Total tokens used: ${total}`, ...lines].join("\n");
}

export function resetLog() {
  log.length = 0;
}
