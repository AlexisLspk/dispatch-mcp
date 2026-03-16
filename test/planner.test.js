/**
 * Integration test: planner produces a valid DAG.
 * Tests renderPlanAsTree and plan structure without calling the Anthropic API.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { renderPlanAsTree } from "../dist/core/planner.js";

describe("planner", () => {
  describe("renderPlanAsTree", () => {
    it("outputs valid stage grouping for parallel nodes", () => {
      const plan = {
        task: "Review auth middleware",
        nodes: [
          { id: "n1", agentName: "security", dependsOn: [], instruction: "Check for XSS" },
          { id: "n2", agentName: "architecture", dependsOn: [], instruction: "Review structure" },
        ],
      };
      const tree = renderPlanAsTree(plan);
      assert.ok(tree.includes("Stage 1"));
      assert.ok(tree.includes("(parallel)"));
      assert.ok(tree.includes("[security]"));
      assert.ok(tree.includes("[architecture]"));
      assert.ok(!tree.includes("Stage 2")); // no dependent stage
    });

    it("outputs valid stage grouping for DAG with dependencies", () => {
      const plan = {
        task: "Full audit",
        nodes: [
          { id: "n1", agentName: "security", dependsOn: [], instruction: "Security check" },
          { id: "n2", agentName: "performance", dependsOn: [], instruction: "Perf check" },
          { id: "n3", agentName: "testing", dependsOn: ["n1", "n2"], instruction: "Test gaps" },
        ],
      };
      const tree = renderPlanAsTree(plan);
      assert.ok(tree.includes("Stage 1"));
      assert.ok(tree.includes("Stage 2"));
      assert.ok(tree.includes("(depends on stages 1..1)")); // stage 2 depends on stage 1
      assert.ok(tree.includes("[security]"));
      assert.ok(tree.includes("[performance]"));
      assert.ok(tree.includes("[testing]"));
    });

    it("handles empty plan gracefully", () => {
      const plan = { task: "Empty", nodes: [] };
      const tree = renderPlanAsTree(plan);
      assert.ok(tree.includes('Execution plan for: "Empty"'));
      assert.ok(tree.length > 0);
    });

    it("validates stage labels are 1-based", () => {
      const plan = {
        task: "Three stages",
        nodes: [
          { id: "a", agentName: "security", dependsOn: [], instruction: "A" },
          { id: "b", agentName: "performance", dependsOn: ["a"], instruction: "B" },
          { id: "c", agentName: "testing", dependsOn: ["b"], instruction: "C" },
        ],
      };
      const tree = renderPlanAsTree(plan);
      assert.ok(tree.includes("Stage 1 (parallel)"));
      assert.ok(tree.includes("Stage 2 (depends on stages 1..1)"));
      assert.ok(tree.includes("Stage 3 (depends on stages 1..2)"));
    });
  });
});
