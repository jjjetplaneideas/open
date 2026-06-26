/**
 * Lightweight, dependency-free tokenizer used for on-device syntax highlighting.
 *
 * This is intentionally a stand-in for a real Tree-sitter integration. In
 * production, swap `tokenizeLine` for a Tree-sitter parser compiled to WASM (or
 * a native module) that emits the same `Token[]` shape — the renderer in
 * `CodeView` does not care how the tokens are produced.
 */
import { colors } from '../theme/theme';

export type TokenKind =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'type'
  | 'punct'
  | 'text';

export interface Token {
  text: string;
  kind: TokenKind;
}

export const tokenColor: Record<TokenKind, string> = {
  keyword: colors.synKeyword,
  string: colors.synString,
  number: colors.synNumber,
  comment: colors.synComment,
  function: colors.synFunction,
  type: colors.synType,
  punct: colors.synPunct,
  text: colors.text,
};

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'class', 'extends', 'new', 'import', 'from', 'export', 'default', 'async',
  'await', 'type', 'interface', 'enum', 'public', 'private', 'static', 'this',
  'fn', 'pub', 'struct', 'impl', 'use', 'mut', 'match', 'Some', 'None', 'true',
  'false', 'null', 'undefined',
]);

const TOKEN_RE = /(\s+)|(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\d+(?:\.\d+)?)|([A-Za-z_$][A-Za-z0-9_$]*)|([{}()[\];:,.<>=+\-*/&|!?%]+)/g;

/** Tokenize a single line of code into colored spans. */
export function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), kind: 'text' });
    }
    const [whole, ws, comment, str, num, ident, punct] = match;
    if (ws) tokens.push({ text: ws, kind: 'text' });
    else if (comment) tokens.push({ text: comment, kind: 'comment' });
    else if (str) tokens.push({ text: str, kind: 'string' });
    else if (num) tokens.push({ text: num, kind: 'number' });
    else if (ident) tokens.push({ text: ident, kind: classifyIdent(ident, line, match.index) });
    else if (punct) tokens.push({ text: punct, kind: 'punct' });
    lastIndex = match.index + whole.length;
  }
  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), kind: 'text' });
  }
  return tokens;
}

function classifyIdent(ident: string, line: string, index: number): TokenKind {
  if (KEYWORDS.has(ident)) return 'keyword';
  // Capitalized -> treat as a type/constructor.
  if (/^[A-Z]/.test(ident)) return 'type';
  // Followed by "(" -> function call/definition.
  if (line[index + ident.length] === '(') return 'function';
  return 'text';
}
