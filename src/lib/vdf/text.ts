/**
 * Parser for Valve's text KeyValues format ("VDF"), used by Steam for
 * appmanifest_*.acf, libraryfolders.vdf, localconfig.vdf, loginusers.vdf, etc.
 *
 * Supported syntax:
 *   - quoted and unquoted tokens, with \" \\ \n \t escapes inside quotes
 *   - nested objects with { }
 *   - // line comments
 *   - conditional suffixes like [$WIN32] (ignored, the pair is kept)
 *
 * Duplicate keys: later scalar values win; duplicate objects are merged.
 */

export type VdfValue = string | VdfObject;
export interface VdfObject {
  [key: string]: VdfValue;
}

export class VdfSyntaxError extends Error {
  constructor(message: string, readonly offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = "VdfSyntaxError";
  }
}

type Token = { kind: "string"; value: string; offset: number } | { kind: "open" | "close"; offset: number };

function* tokenize(input: string): Generator<Token> {
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "﻿") {
      i++;
      continue;
    }
    if (ch === "/" && input[i + 1] === "/") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "{") {
      yield { kind: "open", offset: i++ };
      continue;
    }
    if (ch === "}") {
      yield { kind: "close", offset: i++ };
      continue;
    }
    if (ch === "[") {
      // Conditional like [$WIN32] or [!$X360]: skip it entirely.
      const end = input.indexOf("]", i);
      if (end === -1) throw new VdfSyntaxError("Unterminated conditional", i);
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      const start = i++;
      let out = "";
      while (true) {
        if (i >= n) throw new VdfSyntaxError("Unterminated string", start);
        const c = input[i]!;
        if (c === '"') {
          i++;
          break;
        }
        if (c === "\\" && i + 1 < n) {
          const next = input[i + 1]!;
          out += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : next;
          i += 2;
          continue;
        }
        out += c;
        i++;
      }
      yield { kind: "string", value: out, offset: start };
      continue;
    }
    // Unquoted token: runs until whitespace or a structural character.
    const start = i;
    while (i < n && !/[\s{}"]/.test(input[i]!)) i++;
    yield { kind: "string", value: input.slice(start, i), offset: start };
  }
}

export function parseVdf(input: string): VdfObject {
  const root: VdfObject = {};
  const stack: VdfObject[] = [root];
  let pendingKey: { value: string; offset: number } | null = null;

  for (const tok of tokenize(input)) {
    const current = stack[stack.length - 1]!;
    if (tok.kind === "string") {
      if (pendingKey === null) {
        pendingKey = { value: tok.value, offset: tok.offset };
      } else {
        current[pendingKey.value] = tok.value;
        pendingKey = null;
      }
    } else if (tok.kind === "open") {
      if (pendingKey === null) throw new VdfSyntaxError("Object without a key", tok.offset);
      const existing = current[pendingKey.value];
      const obj: VdfObject = typeof existing === "object" ? existing : {};
      current[pendingKey.value] = obj;
      stack.push(obj);
      pendingKey = null;
    } else {
      if (pendingKey !== null) throw new VdfSyntaxError(`Key "${pendingKey.value}" has no value`, pendingKey.offset);
      if (stack.length === 1) throw new VdfSyntaxError("Unbalanced closing brace", tok.offset);
      stack.pop();
    }
  }

  if (pendingKey !== null) throw new VdfSyntaxError(`Key "${pendingKey.value}" has no value`, pendingKey.offset);
  if (stack.length !== 1) throw new VdfSyntaxError("Unexpected end of input (unclosed object)", input.length);
  return root;
}

/** Case-insensitive key lookup. Steam is inconsistent about key casing ("apps" vs "Apps"). */
export function getKey(obj: VdfObject | undefined, key: string): VdfValue | undefined {
  if (!obj) return undefined;
  if (key in obj) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k];
  }
  return undefined;
}

/** Walk a path of keys case-insensitively, returning the object at the end (or undefined). */
export function getObject(obj: VdfObject | undefined, ...path: string[]): VdfObject | undefined {
  let cur: VdfValue | undefined = obj;
  for (const key of path) {
    if (typeof cur !== "object") return undefined;
    cur = getKey(cur, key);
  }
  return typeof cur === "object" ? cur : undefined;
}

export function getString(obj: VdfObject | undefined, key: string): string | undefined {
  const v = getKey(obj, key);
  return typeof v === "string" ? v : undefined;
}

export function getNumber(obj: VdfObject | undefined, key: string): number | undefined {
  const s = getString(obj, key);
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
