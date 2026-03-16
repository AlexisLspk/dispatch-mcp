# Contributing

This project is provided as-is, open source. Contributions are welcome.

## How to contribute

1. **Fork** the repo and clone your fork.
2. **Create a branch** for your change: `git checkout -b fix/thing` or `feat/new-agent`.
3. **Make your changes** and run `npm run test` to ensure tests pass.
4. **Commit** with a clear message: `git commit -m "feat: add devops agent"`.
5. **Push** to your fork and open a Pull Request.

## Adding a new agent

1. Open `src/agents/registry.ts`.
2. Add a `makeAgent(name, description, systemPrompt)` entry.
3. The Planner will discover it automatically on the next run.
4. Update the "Available agents" table in README.md.

## Code style

- TypeScript, ES modules.
- No extra dependencies unless justified.
- Keep agent prompts focused and actionable.

## Questions?

Open an issue. No guarantees on response time — this is a hobby project.
