// Structured stderr logger — keeps stdout clean for MCP stdio transport

type Level = "info" | "warn" | "error" | "debug";

const TTY = process.stderr?.isTTY ?? false;
const R = "\x1b[0m";
const C = TTY ? "\x1b[36m" : "";   // cyan (▶)
const O = TTY ? "\x1b[38;5;208m" : ""; // orange (dispatch)
const G = TTY ? "\x1b[32m" : "";   // green (✔)
const Y = TTY ? "\x1b[33m" : "";   // yellow (⚠)
const Rr = TTY ? "\x1b[31m" : "";  // red (✖)
const V = TTY ? "\x1b[35m" : "";   // violet (action words)

function write(level: Level, message: string, data?: unknown) {
  const prefix = {
    info:  `${C}▶${R} ${O}dispatch${R} `,
    warn:  `${Y}⚠${R} ${O}dispatch${R} `,
    error: `${Rr}✖${R} ${O}dispatch${R} `,
    debug: `${C}·${R} ${O}dispatch${R} `,
  }[level];

  const line = data
    ? `${prefix}${message} ${JSON.stringify(data)}`
    : `${prefix}${message}`;

  process.stderr.write(line + "\n");
}

export const logger = {
  info:  (msg: string, data?: unknown) => write("info",  msg, data),
  warn:  (msg: string, data?: unknown) => write("warn",  msg, data),
  error: (msg: string, data?: unknown) => write("error", msg, data),
  debug: (msg: string, data?: unknown) => write("debug", msg, data),
  done:  (msg: string) =>
    process.stderr.write(`${G}✔${R} ${O}dispatch${R}  ${msg}\n`),
};

export function colorizeBanner(text: string): string {
  return TTY ? `${O}${text}${R}` : text;
}
