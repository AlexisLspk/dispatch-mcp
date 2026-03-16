/** Max chars for task+context+code to avoid blowing past Claude context limits. */
export const MAX_INPUT_CHARS = 100_000;

/** Per-agent timeout in ms; prevents one slow agent from blocking forever. */
export const AGENT_TIMEOUT_MS = 120_000;
