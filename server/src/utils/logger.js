/**
 * Structured logger with file rotation, severity levels, and JSON output.
 * Logs are written to server/logs/<app>.log and rotated at 10 MB.
 * Stderr is used for errors/warnings so stdout pipelines stay clean.
 */
import fs from 'fs';
import path from 'path';

const LEVELS = { security: 0, error: 1, warn: 2, info: 3, debug: 4 };
const LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const COLORS = {
  security: '\x1b[35m', error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m', reset: '\x1b[0m',
};

let logStream = null;
let logSize = 0;
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10 MB

function getLogPath() {
  const dir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'app.log');
}

function rotateIfNeeded() {
  if (!logStream) return;
  const p = getLogPath();
  if (logSize >= MAX_LOG_BYTES) {
    try { logStream.end(); } catch { /* ignore */ }
    try {
      const rotated = p + '.' + Date.now();
      fs.renameSync(p, rotated);
    } catch { /* ignore */ }
    logStream = fs.createWriteStream(p, { flags: 'a' });
    logSize = 0;
  }
}

function writeFile(entry) {
  try {
    rotateIfNeeded();
    if (!logStream) {
      logStream = fs.createWriteStream(getLogPath(), { flags: 'a' });
    }
    const line = JSON.stringify(entry) + '\n';
    logStream.write(line);
    logSize += Buffer.byteLength(line);
  } catch { /* silent */ }
}

function formatArgs(args) {
  return args.map((a) => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

function out(level, ...args) {
  if (LEVELS[level] === undefined || LEVELS[level] > LEVEL) return;
  const ts = new Date().toISOString();
  const color = COLORS[level] || '';
  const reset = COLORS.reset;
  const message = formatArgs(args);
  const line = `${color}[${ts}] [${level.toUpperCase()}]${reset} ${message}`;
  if (level === 'error' || level === 'warn' || level === 'security') {
    console.error(line);
  } else {
    console.log(line);
  }
  const entry = { ts, level, message, pid: process.pid };
  writeFile(entry);
}

export const log = {
  info:    (...a) => out('info', ...a),
  warn:    (...a) => out('warn', ...a),
  error:   (...a) => out('error', ...a),
  security:(...a) => out('security', ...a),
  debug:   (...a) => out('debug', ...a),
};
