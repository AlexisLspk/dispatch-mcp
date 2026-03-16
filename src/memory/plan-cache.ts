/**
 * Cross-run plan cache. Identical tasks reuse cached plans to avoid re-spending
 * tokens on planning. Uses file-based persistence under DISPATCH_CACHE_DIR
 * (default: .dispatch-cache in project root or homedir).
 */
import { createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import type { ExecutionPlan } from "../types.js";
import { logger } from "../utils/logger.js";

const CACHE_DIR =
  process.env.DISPATCH_CACHE_DIR ??
  join(process.cwd(), ".dispatch-cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function taskKey(task: string): string {
  const normalized = task.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `plan-${key}.json`);
}

export async function getCachedPlan(task: string): Promise<ExecutionPlan | null> {
  if (process.env.DISPATCH_DISABLE_CACHE === "1") return null;
  try {
    const key = taskKey(task);
    const path = cachePath(key);
    if (!existsSync(path)) return null;
    const raw = await readFile(path, "utf-8");
    const { plan, ts } = JSON.parse(raw) as { plan: ExecutionPlan; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    logger.info("plan cache hit");
    return plan;
  } catch {
    return null;
  }
}

export async function setCachedPlan(task: string, plan: ExecutionPlan): Promise<void> {
  if (process.env.DISPATCH_DISABLE_CACHE === "1") return;
  try {
    if (!existsSync(CACHE_DIR)) {
      await mkdir(CACHE_DIR, { recursive: true });
    }
    const key = taskKey(task);
    const path = cachePath(key);
    await writeFile(
      path,
      JSON.stringify({ plan, ts: Date.now() }, null, 0),
      "utf-8"
    );
  } catch (err) {
    logger.warn("plan cache write failed", String(err));
  }
}
