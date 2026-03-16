#!/usr/bin/env node
import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { plan, renderPlanAsTree } from "./core/planner.js";
import { execute } from "./core/executor.js";
import { critique } from "./core/critic.js";
import { merge } from "./core/merger.js";
import { AGENT_REGISTRY, getAgent } from "./agents/registry.js";
import { getTotalTokens, resetLog } from "./utils/cost-tracker.js";
import { logger } from "./utils/logger.js";
import { formatApiError } from "./utils/api-errors.js";
import { MAX_INPUT_CHARS } from "./utils/constants.js";
import type { RunMetadata } from "./types.js";

const server = new McpServer({
  name: "dispatch-mcp",
  version: "1.0.0",
});

// ─── Tool 1: Full orchestrated run ───────────────────────────────────────────
// The main tool. Describe a task, Dispatch plans and runs everything.

server.tool(
  "dispatch_run",
  `Multi-agent orchestrator. Describe any code review, analysis, or audit task in plain English.
Dispatch will automatically select the right specialist agents, run them in parallel where possible,
critique the results, and return a single prioritized report.

Examples:
- "Review this Express.js auth middleware for production readiness"
- "Audit my React component for performance and accessibility issues"
- "Check this Python script for security vulnerabilities and code quality"`,
  {
    task: z
      .string()
      .describe("What you want analyzed — be specific about the goal"),
    code: z
      .string()
      .optional()
      .describe("The code or content to analyze (paste it here)"),
    context: z
      .string()
      .optional()
      .describe(
        "Optional: additional context like framework, environment, or constraints"
      ),
  },
  async ({ task, code, context }) => {
    resetLog();
    const start = Date.now();

    const fullTask = [
      task,
      context ? `Context: ${context}` : "",
      code ? `\n\`\`\`\n${code}\n\`\`\`` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (fullTask.length > MAX_INPUT_CHARS) {
      return {
        content: [
          {
            type: "text",
            text: `Input too large (${fullTask.length.toLocaleString()} chars). Maximum is ${MAX_INPUT_CHARS.toLocaleString()} characters. Split your code into smaller chunks or summarize the relevant parts.`,
          },
        ],
      };
    }

    try {
      // 1. Plan — decide which agents to run and in what order
      const executionPlan = await plan(fullTask);

      // 2. Execute — run the DAG, respecting dependencies
      let results = await execute(executionPlan);

      // 3. Critique — check quality, retry weak agents if needed
      let retries = 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { approved, retryNodes } = await critique(
          fullTask,
          results,
          attempt
        );

        if (approved || retryNodes.length === 0) break;

        retries++;
        logger.info(`retrying ${retryNodes.length} agent(s)...`);

        // Re-run only the flagged nodes with refined instructions (preserve dependsOn for context)
        const retryPlan = {
          task: fullTask,
          nodes: retryNodes.map((r) => {
            const original = executionPlan.nodes.find((n) => n.id === r.id);
            return {
              id: r.id,
              agentName: original?.agentName ?? r.id,
              dependsOn: original?.dependsOn ?? [],
              instruction: r.refinedInstruction,
            };
          }),
        };

        const retryResults = await execute(retryPlan, results);
        retryResults.forEach((v, k) => results.set(k, v));
      }

      // 4. Merge — synthesize into one prioritized report
      const failures = [...results.values()].filter((r) => !r.success).length;
      const meta: RunMetadata = {
        totalAgents: results.size,
        stages: executionPlan.nodes.length,
        totalTokens: getTotalTokens(),
        totalDurationMs: Date.now() - start,
        retries,
        failures,
      };

      const output = await merge(fullTask, results, meta);

      logger.done(
        `done in ${(meta.totalDurationMs / 1000).toFixed(1)}s — ${meta.totalAgents} agents, ${meta.stages} stages, ${meta.failures} failures`
      );

      return { content: [{ type: "text", text: output }] };
    } catch (err) {
      const msg = formatApiError(err);
      logger.error("dispatch_run failed", msg);
      return {
        content: [
          {
            type: "text",
            text: `Dispatch failed: ${msg}\n\nCheck that ANTHROPIC_API_KEY is set correctly.`,
          },
        ],
      };
    }
  }
);

// ─── Tool 2: Preview the plan ─────────────────────────────────────────────────
// Show the execution plan without running anything — great for debugging.

server.tool(
  "dispatch_plan",
  "Preview the execution plan for a task without running any agents. Shows which agents would be selected and in what order.",
  {
    task: z.string().describe("The task to plan"),
    code: z.string().optional().describe("Optional code to include in context"),
  },
  async ({ task, code }) => {
    const fullTask = code ? `${task}\n\n\`\`\`\n${code}\n\`\`\`` : task;

    if (fullTask.length > MAX_INPUT_CHARS) {
      return {
        content: [
          {
            type: "text",
            text: `Input too large (${fullTask.length.toLocaleString()} chars). Maximum is ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
          },
        ],
      };
    }

    try {
      const executionPlan = await plan(fullTask);
      const tree = renderPlanAsTree(executionPlan);
      return { content: [{ type: "text", text: tree }] };
    } catch (err) {
      const msg = formatApiError(err);
      return {
        content: [{ type: "text", text: `Planning failed: ${msg}` }],
      };
    }
  }
);

// ─── Tool 3: Run a single agent directly ──────────────────────────────────────
// Escape hatch: skip the orchestrator and talk to one agent directly.

const agentNames = AGENT_REGISTRY.map((a) => a.name) as [
  string,
  ...string[]
];

server.tool(
  "dispatch_agent",
  `Run a single specialist agent directly, bypassing the orchestrator.
Available agents: ${agentNames.join(", ")}`,
  {
    agent: z
      .enum(agentNames)
      .describe("Which specialist agent to run"),
    instruction: z
      .string()
      .describe("What to ask this specific agent"),
    code: z.string().optional().describe("Optional code to include"),
  },
  async ({ agent: agentName, instruction, code }) => {
    const agent = getAgent(agentName);
    if (!agent) {
      return {
        content: [
          { type: "text", text: `Unknown agent: ${agentName}` },
        ],
      };
    }

    const fullInstruction = code
      ? `${instruction}\n\n\`\`\`\n${code}\n\`\`\``
      : instruction;

    if (fullInstruction.length > MAX_INPUT_CHARS) {
      return {
        content: [
          {
            type: "text",
            text: `Input too large (${fullInstruction.length.toLocaleString()} chars). Maximum is ${MAX_INPUT_CHARS.toLocaleString()} characters.`,
          },
        ],
      };
    }

    try {
      const result = await agent.run(fullInstruction, "");
      return { content: [{ type: "text", text: result.result }] };
    } catch (err) {
      const msg = formatApiError(err);
      return {
        content: [{ type: "text", text: `Agent failed: ${msg}` }],
      };
    }
  }
);

// ─── Start the server ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const bannerPath = join(__dirname, import.meta.url.endsWith(".ts") ? "banner.txt" : "../src/banner.txt");
const BANNER = readFileSync(bannerPath, "utf-8");
process.stderr.write(BANNER + "\n");

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("server ready");
