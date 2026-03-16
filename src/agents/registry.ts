import Anthropic from "@anthropic-ai/sdk";
import type { Agent, AgentResult } from "../types.js";
import { recordCost } from "../utils/cost-tracker.js";
import { logger } from "../utils/logger.js";

const client = new Anthropic();

function makeAgent(
  name: string,
  description: string,
  systemPrompt: string
): Agent {
  return {
    name,
    description,
    run: async (instruction: string, priorContext: string): Promise<AgentResult> => {
      const start = Date.now();
      logger.info(`[${name}] starting`);

      const userContent = priorContext
        ? `Prior context from upstream agents:\n${priorContext}\n\n---\n\nYour task: ${instruction}`
        : instruction;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });

      const result = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const tokens = response.usage.input_tokens + response.usage.output_tokens;
      const durationMs = Date.now() - start;

      recordCost(name, tokens, durationMs);
      logger.info(`[${name}] done in ${(durationMs / 1000).toFixed(1)}s — ${tokens} tokens`);

      return { agent: name, result, success: true, tokens, durationMs };
    },
  };
}

// ─── Agent definitions ────────────────────────────────────────────────────────
// The `description` field is what the Planner reads to decide when to invoke
// each agent. Keep it specific and action-oriented.

export const AGENT_REGISTRY: Agent[] = [
  makeAgent(
    "security",
    "Finds security vulnerabilities: injection risks, auth flaws, exposed secrets, insecure dependencies, improper input validation, and OWASP Top 10 issues.",
    `You are a senior application security engineer. Analyze the provided code or system description 
for security vulnerabilities. Be specific: name the vulnerability, its location, severity (CRITICAL/HIGH/MEDIUM/LOW), 
and a concrete fix. Format findings as a numbered list. Skip generic advice.`
  ),

  makeAgent(
    "performance",
    "Identifies performance bottlenecks: N+1 queries, memory leaks, algorithmic complexity, unnecessary re-renders, blocking I/O, and missing caching.",
    `You are a performance engineering specialist. Analyze the provided code for performance issues.
For each issue: describe the problem, estimate its impact, and suggest a specific optimization.
Include time/space complexity where relevant. Format as a numbered list.`
  ),

  makeAgent(
    "architecture",
    "Reviews system design and code structure: SOLID principles, coupling, cohesion, design patterns, modularity, and scalability concerns.",
    `You are a software architect. Review the provided code or system for architectural quality.
Evaluate: separation of concerns, coupling, cohesion, adherence to SOLID principles, appropriate use of patterns.
Be specific about what should be restructured and why. Format as a numbered list.`
  ),

  makeAgent(
    "testing",
    "Assesses test coverage and quality: missing edge cases, untested paths, flaky tests, test design anti-patterns, and coverage gaps.",
    `You are a testing and quality assurance expert. Analyze the provided code for testing gaps.
Identify: missing test cases, untested edge cases, poor test design, and flaky test patterns.
For each gap, describe what should be tested and how. Format as a numbered list.`
  ),

  makeAgent(
    "documentation",
    "Checks code documentation quality: missing JSDoc/docstrings, unclear naming, missing README sections, undocumented APIs, and confusing abstractions.",
    `You are a technical writing and documentation specialist. Review the provided code for documentation quality.
Flag: missing docstrings, poor naming, undocumented public APIs, missing usage examples, and unclear abstractions.
Suggest specific improvements. Format as a numbered list.`
  ),

  makeAgent(
    "accessibility",
    "Reviews frontend code for accessibility issues: missing ARIA attributes, keyboard navigation, color contrast, semantic HTML, and WCAG compliance.",
    `You are a web accessibility specialist (WCAG 2.1 AA). Review the provided code for accessibility issues.
For each issue: describe the problem, its WCAG criterion, affected users, and the fix.
Format as a numbered list with severity (CRITICAL/HIGH/MEDIUM/LOW).`
  ),

  makeAgent(
    "dependencies",
    "Audits third-party dependencies: outdated packages, known CVEs, unnecessary libraries, license conflicts, and bundle size concerns.",
    `You are a supply chain and dependency security expert. Analyze the provided package list or code
for dependency issues: outdated versions, known vulnerabilities, unnecessary packages, license problems.
Format as a numbered list with severity ratings.`
  ),

  makeAgent(
    "i18n",
    "Finds hardcoded strings that should be externalized for internationalization, locale handling gaps, and RTL/LTR issues.",
    `You are an internationalization (i18n) specialist. Analyze the provided code for i18n issues.
Identify: hardcoded user-facing strings, missing locale handling, date/number formatting, pluralization gaps,
RTL/LTR layout concerns, and character encoding. For each: location, the fix, and recommended library (e.g. i18next).
Format as a numbered list.`
  ),

  makeAgent(
    "devops",
    "Reviews CI/CD, deployment configs, Docker/K8s, infrastructure as code, and observability (logging, metrics, tracing).",
    `You are a DevOps and platform engineer. Analyze the provided code or configs for infrastructure concerns.
Identify: CI/CD gaps, insecure secrets handling, missing health checks, container anti-patterns,
scaling limits, and observability gaps (logging, metrics, tracing). Suggest concrete improvements.
Format as a numbered list with severity.`
  ),
];

export function getAgent(name: string): Agent | undefined {
  return AGENT_REGISTRY.find((a) => a.name === name);
}

export function getAgentNames(): string[] {
  return AGENT_REGISTRY.map((a) => a.name);
}
