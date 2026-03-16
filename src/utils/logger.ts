// Structured stderr logger — keeps stdout clean for MCP stdio transport

type Level = "info" | "warn" | "error" | "debug";

function write(level: Level, message: string, data?: unknown) {
  const prefix = {
    info:  "▶ dispatch ",
    warn:  "⚠ dispatch ",
    error: "✖ dispatch ",
    debug: "· dispatch ",
  }[level];

  const line = data
    ? `${prefix} ${message} ${JSON.stringify(data)}`
    : `${prefix} ${message}`;

  process.stderr.write(line + "\n");
}

export const logger = {
  info:  (msg: string, data?: unknown) => write("info",  msg, data),
  warn:  (msg: string, data?: unknown) => write("warn",  msg, data),
  error: (msg: string, data?: unknown) => write("error", msg, data),
  debug: (msg: string, data?: unknown) => write("debug", msg, data),
  done:  (msg: string) => process.stderr.write(`✔ dispatch  ${msg}\n`),
};
