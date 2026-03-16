# Dispatch MCP — Examples

These examples show how to use Dispatch tools with sample inputs and expected behaviors.

## Prerequisites

- Cursor with Dispatch MCP configured (see main README)
- `ANTHROPIC_API_KEY` set in your MCP config or `.env`

## Examples

| File | Tool | Description |
|------|------|-------------|
| `01-security-audit.json` | `dispatch_run` | Full orchestrated run: review Express auth middleware |
| `02-plan-preview.json` | `dispatch_plan` | Preview plan only — no agents run |
| `03-single-agent.json` | `dispatch_agent` | Single security agent: SQL injection check |

## How to run

1. Open Cursor and ensure Dispatch MCP is connected.
2. Use the MCP panel to invoke the tools with the `params` from each JSON file.
3. Compare the output with `expected_behavior` / `expected_output_structure`.

## Notes

- Actual agent outputs vary (Claude is non-deterministic). The expected fields describe the *kind* of content, not exact text.
- For `dispatch_run`, the merged report format: CRITICAL → HIGH → MEDIUM → LOW, then Quick wins.
