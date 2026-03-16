/**
 * Cross-run cache for agent results. Identical (agent, instruction, priorContext)
 * reuse cached output to avoid re-spending tokens.
 */
import { createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { AgentResult } from "../types.js";
import { logger } from "../utils/logger.js";

const CACHE_DIR =
  process.env.DISPATCH_CACHE_DIR ??
  join(process.cwd(), ".dispatch-cache");
const AGENT_CACHE_DIR = join(CACHE_DIR, "agent-results");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cacheKey(agentName: string, instruction: string, priorContext: string): string {
  const raw = `${agentName}\n---\n${instruction}\n---\n${priorContext}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function cachePath(key: string): string {
  return join(AGENT_CACHE_DIR, `${key}.json`);
}

export async function getCachedAgentResult(
  agentName: string,
  instruction: string,
  priorContext: string
): Promise<AgentResult | null> {
  if (process.env.DISPATCH_DISABLE_CACHE === "1") return null;
  try {
    const key = cacheKey(agentName, instruction, priorContext);
    const path = cachePath(key);
    if (!existsSync(path)) return null;
    const raw = await readFile(path, "utf-8");
    const { result, ts } = JSON.parse(raw) as { result: AgentResult; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    logger.info(`[${agentName}] cache hit`);
    return result;
  } catch {
    return null;
  }
}

export async function setCachedAgentResult(
  agentName: string,
  instruction: string,
  priorContext: string,
  result: AgentResult
): Promise<void> {
  if (process.env.DISPATCH_DISABLE_CACHE === "1") return;
  try {
    if (!existsSync(AGENT_CACHE_DIR)) {
      await mkdir(AGENT_CACHE_DIR, { recursive: true });
    }
    const key = cacheKey(agentName, instruction, priorContext);
    const path = cachePath(key);
    await writeFile(
      path,
      JSON.stringify({ result, ts: Date.now() }, null, 0),
      "utf-8"
    );
  } catch (err) {
    logger.warn("agent result cache write failed", String(err));
  }
}
