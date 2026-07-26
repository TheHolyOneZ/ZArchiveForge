/**
 * strip-comments.mjs
 *
 * Removes all comments from .rs, .ts, .tsx, and .css files using a character-by-character
 * state machine. Handles all edge cases: nested Rust block comments, raw string literals,
 * Rust lifetime annotations, TS regex literal disambiguation, JSX comments, template
 * literals with nested ${...} expressions, CSS url() tokens, and CRLF/LF line endings.
 *
 * Usage:
 *   node strip-comments.mjs [--dry-run] <glob-or-path> [<glob-or-path> ...]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, extname, join } from 'path';
import { argv, stdout, exit } from 'process';

// ---------------------------------------------------------------------------
// Rust comment stripper
// ---------------------------------------------------------------------------

/**
 * Strip comments from Rust source code.
 * States: normal, line_comment, block_comment, string_double, string_raw, char_lit, lifetime
 */
function stripRust(source) {
  const len = source.length;
  let out = '';
  let i = 0;

  // State
  let state = 'normal';
  let blockDepth = 0;    // for nested block comments
  let rawHashes = 0;     // number of # in raw string delimiter

  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : '';

    switch (state) {
      case 'normal': {
        // Check for shebang (only at very start)
        if (i === 0 && ch === '#' && next === '!') {
          // Preserve entire first line
          while (i < len && source[i] !== '\n') {
            out += source[i];
            i++;
          }
          break;
        }

        // Line comment: // (includes ///, //!)
        if (ch === '/' && next === '/') {
          state = 'line_comment';
          i += 2;
          break;
        }

        // Block comment: /*
        if (ch === '/' && next === '*') {
          state = 'block_comment';
          blockDepth = 1;
          i += 2;
          break;
        }

        // Raw string: r#*"
        if (ch === 'r') {
          // Peek ahead: optional sequence of # followed by "
          let j = i + 1;
          let hashes = 0;
          while (j < len && source[j] === '#') {
            hashes++;
            j++;
          }
          if (j < len && source[j] === '"') {
            // It's a raw string
            rawHashes = hashes;
            state = 'string_raw';
            // Output the opening delimiter: r###"
            out += source.slice(i, j + 1);
            i = j + 1;
            break;
          }
          // Not a raw string; fall through to output 'r'
          out += ch;
          i++;
          break;
        }

        // Double-quoted string
        if (ch === '"') {
          state = 'string_double';
          out += ch;
          i++;
          break;
        }

        // Char literal or lifetime
        if (ch === '\'') {
          // Determine if this is a lifetime: 'identifier (not followed by a char then closing ')
          // Lifetime heuristic: ' followed by letter/_ then either another alphanumeric/_ or whitespace/> etc.
          // NOT a lifetime if: ' X ' where X is a single char (possibly escaped)
          // NOT a lifetime if next char is '\' (escaped char literal)
          // This matches the Rust reference:
          //   lifetime: 'identifier (where identifier cannot be a char literal)
          //   char lit:  'char' or '\escape'
          if (isLifetime(source, i)) {
            // Output as-is; it's a lifetime annotation like 'a, 'static
            state = 'lifetime';
            out += ch;
            i++;
          } else {
            state = 'char_lit';
            out += ch;
            i++;
          }
          break;
        }

        // byte literal: b'...' — treat like char_lit
        if (ch === 'b' && next === '\'') {
          out += ch;
          i++;
          // next iteration will hit the ' and determine lifetime vs char
          break;
        }

        // byte string: b"..."
        if (ch === 'b' && next === '"') {
          out += ch;
          i++;
          // next iteration hits " → string_double
          break;
        }

        // Rust attribute #[...] — preserve as-is. Nothing special needed since
        // #[doc = "..."] will be handled by the string_double state when we hit
        // the " inside it. We don't need special handling; the state machine
        // already preserves everything that isn't a comment.

        out += ch;
        i++;
        break;
      }

      case 'line_comment': {
        // Consume until newline; newline itself is NOT output (comment line)
        // But we do output the newline to preserve line structure
        if (ch === '\n') {
          out += ch;
          state = 'normal';
        }
        // If CRLF: the \r will be consumed here (ignored), \n triggers above
        i++;
        break;
      }

      case 'block_comment': {
        // Nested: /* increases depth, */ decreases
        if (ch === '/' && next === '*') {
          blockDepth++;
          i += 2;
          break;
        }
        if (ch === '*' && next === '/') {
          blockDepth--;
          i += 2;
          if (blockDepth === 0) {
            state = 'normal';
          }
          break;
        }
        // Preserve newlines inside block comments to maintain line count
        if (ch === '\n') {
          out += '\n';
        }
        i++;
        break;
      }

      case 'string_double': {
        out += ch;
        if (ch === '\\') {
          // Escape sequence: output next char too, skip both
          if (i + 1 < len) {
            out += source[i + 1];
            i += 2;
          } else {
            i++;
          }
          break;
        }
        if (ch === '"') {
          state = 'normal';
        }
        i++;
        break;
      }

      case 'string_raw': {
        // Raw string: ends on " followed by exactly rawHashes '#'
        out += ch;
        if (ch === '"') {
          // Count trailing #
          let hCount = 0;
          let j = i + 1;
          while (j < len && source[j] === '#' && hCount < rawHashes) {
            hCount++;
            j++;
          }
          if (hCount === rawHashes) {
            // End of raw string
            out += source.slice(i + 1, j);
            i = j;
            state = 'normal';
            break;
          }
        }
        i++;
        break;
      }

      case 'char_lit': {
        out += ch;
        if (ch === '\\') {
          // Escape: output next char
          if (i + 1 < len) {
            out += source[i + 1];
            i += 2;
          } else {
            i++;
          }
          break;
        }
        if (ch === '\'') {
          state = 'normal';
        }
        i++;
        break;
      }

      case 'lifetime': {
        // Output alphanumeric/underscore chars of the lifetime identifier
        if (isIdentChar(ch)) {
          out += ch;
          i++;
        } else {
          state = 'normal';
          // Don't advance i; reprocess this char in normal state
        }
        break;
      }

      default:
        out += ch;
        i++;
        break;
    }
  }

  return out;
}

/**
 * Determine if the `'` at position i in source is a lifetime annotation.
 * Lifetime: 'ident where ident starts with letter/_ and either:
 *   - ident is "static", "_ " etc., OR
 *   - it is followed by a non-char context (i.e. not a single char then closing ')
 *
 * The simplest correct heuristic (matching Rust's lexer rules):
 * A token starting with ' is a CHAR LITERAL if:
 *   - next char is '\' (escape), OR
 *   - next char is a non-identifier char (like a space... but that's invalid), OR
 *   - next char is a valid char and the char after that is ' (i.e. exactly one char between quotes)
 *     UNLESS the middle char itself starts an identifier (then it might be a lifetime 'a' vs 'a)
 *
 * Rust's actual rule: if ' is followed by a non-identifier char, or if '
 * followed by identifier chars has a closing ' immediately after, it's a char literal.
 * Otherwise it's a lifetime.
 *
 * More precisely (from the Rust reference):
 *   LIFETIME_TOKEN: ' (identifier_continue* | '_' identifier_continue+)
 *   CHAR_LITERAL: ' (char_body | escape) '
 *   where char_body is any Unicode scalar that is not ' or \
 *
 * So: after ', if next is \, it's a char escape. If next is an identifier-start
 * character and it is NOT immediately followed by ', it's a lifetime.
 * If next is an identifier-start and IS immediately followed by ', it COULD be
 * either (like 'a' is a char, 'a in &'a str is lifetime).
 *
 * The key: if the character after the identifier chars is ', then it's a char literal.
 * If not, it's a lifetime.
 */
function isLifetime(source, i) {
  // i is position of '
  const len = source.length;
  const next = i + 1 < len ? source[i + 1] : '';

  // Escape sequence → definitely char literal
  if (next === '\\') return false;

  // Not identifier start → char literal (e.g. '\'' won't reach here because \ caught above,
  // but a space or digit after ' would be unusual — treat as char)
  if (!isIdentStart(next)) return false;

  // next is identifier-start. Scan the full identifier.
  let j = i + 1;
  while (j < len && isIdentChar(source[j])) {
    j++;
  }
  // j now points to the char after the identifier

  // If immediately followed by ', it's a char literal like 'a'
  if (j < len && source[j] === '\'') return false;

  // Otherwise it's a lifetime like 'a or 'static
  return true;
}

function isIdentStart(ch) {
  return /[a-zA-Z_\u0080-\uFFFF]/.test(ch);
}

function isIdentChar(ch) {
  return /[a-zA-Z0-9_\u0080-\uFFFF]/.test(ch);
}

// ---------------------------------------------------------------------------
// TypeScript/TSX comment stripper
// ---------------------------------------------------------------------------

/**
 * Strip comments from TypeScript/TSX source code.
 *
 * States:
 *   normal, line_comment, block_comment, jsx_comment,
 *   string_single, string_double, template_literal,
 *   template_expr (inside ${...}), regex_literal
 */
function stripTS(source) {
  const len = source.length;
  let out = '';
  let i = 0;

  // Track the "previous significant token" for regex disambiguation
  // We store the last non-whitespace, non-comment token text seen
  let lastToken = ''; // updated as we emit non-whitespace chars

  // State stack for template literal nesting
  // Each entry: { state, braceDepth }
  const stateStack = [];

  let state = 'normal';

  // For regex: track character class brackets
  let regexInCharClass = false;

  // For template expressions: brace depth
  let templateBraceDepth = 0;

  // Helper: update lastToken tracking. Called after we commit a character to output.
  // We track by rebuilding lastToken from the last "word" or "symbol" emitted.
  // This is used to disambiguate / as regex vs division.
  // Instead of full token tracking, we maintain a "lastSignificantChars" buffer.

  // We track the last non-whitespace run for the purpose of regex disambiguation.
  // lastToken is set to the last identifier or operator seen.
  let lastSignificant = ''; // the last sequence of non-whitespace chars emitted (resets on whitespace)

  function recordOutput(str) {
    for (const ch of str) {
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        if (lastSignificant.length > 0) {
          lastToken = lastSignificant;
          lastSignificant = '';
        }
      } else {
        lastSignificant += ch;
      }
    }
  }

  function emit(str) {
    out += str;
    recordOutput(str);
  }

  function slashStartsRegex() {
    // The current lastToken (or lastSignificant if non-empty) is the previous token
    const prev = lastSignificant.length > 0 ? lastSignificant : lastToken;
    // Regex after these tokens:
    const regexStarters = new Set([
      '=', '(', '[', '!', '&', '|', '?', ':', ',', '{', '}', ';',
      'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
      'throw', 'void', 'case', '+=', '-=', '*=', '/=', '%=', '**=',
      '&&=', '||=', '??=', '==', '===', '!=', '!==', '<', '>', '<=',
      '>=', '=>', '...', '~', '^', '**', '<<', '>>', '>>>',
    ]);

    if (prev === '') return true; // start of file
    if (regexStarters.has(prev)) return true;

    // Also check if prev ends with one of the operator chars (for multi-char ops)
    // that aren't identifiers
    const lastChar = prev[prev.length - 1];
    if ('=(<[!&|?:,{};~^'.includes(lastChar) && !isIdentChar(lastChar)) return true;

    return false;
  }

  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : '';

    switch (state) {
      case 'normal': {
        // Shebang
        if (i === 0 && ch === '#' && next === '!') {
          while (i < len && source[i] !== '\n') {
            emit(source[i]);
            i++;
          }
          break;
        }

        // JSX comment: {/*
        // We need to detect { followed by /* in JSX context.
        // Since we can't perfectly track JSX context without a full parser,
        // we use a pragmatic heuristic: {/* is almost certainly a JSX comment.
        // We detect it as: { immediately followed by /* (no space).
        if (ch === '{' && next === '/' && i + 2 < len && source[i + 2] === '*') {
          // Enter JSX comment — don't emit the {
          state = 'jsx_comment';
          i += 3; // skip {/*
          break;
        }

        // Line comment
        if (ch === '/' && next === '/') {
          state = 'line_comment';
          i += 2;
          break;
        }

        // Block comment
        if (ch === '/' && next === '*') {
          state = 'block_comment';
          i += 2;
          break;
        }

        // Regex literal check
        if (ch === '/') {
          if (slashStartsRegex()) {
            // Start regex
            state = 'regex_literal';
            regexInCharClass = false;
            emit(ch);
            i++;
            break;
          }
          // Division operator
          emit(ch);
          i++;
          break;
        }

        // Template literal
        if (ch === '`') {
          state = 'template_literal';
          emit(ch);
          i++;
          break;
        }

        // Single-quoted string
        if (ch === '\'') {
          state = 'string_single';
          emit(ch);
          i++;
          break;
        }

        // Double-quoted string
        if (ch === '"') {
          state = 'string_double';
          emit(ch);
          i++;
          break;
        }

        emit(ch);
        i++;
        break;
      }

      case 'line_comment': {
        if (ch === '\n') {
          emit(ch);
          state = 'normal';
        }
        i++;
        break;
      }

      case 'block_comment': {
        // TS/JS block comments do NOT nest
        if (ch === '*' && next === '/') {
          i += 2;
          state = 'normal';
          break;
        }
        if (ch === '\n') {
          emit('\n'); // preserve line structure
        }
        i++;
        break;
      }

      case 'jsx_comment': {
        // End on */}
        if (ch === '*' && next === '/' && i + 2 < len && source[i + 2] === '}') {
          i += 3; // skip */}
          state = 'normal';
          break;
        }
        // Also handle */ without } (malformed JSX comment — end anyway)
        if (ch === '*' && next === '/') {
          i += 2;
          state = 'normal';
          break;
        }
        if (ch === '\n') {
          emit('\n');
        }
        i++;
        break;
      }

      case 'string_single': {
        emit(ch);
        if (ch === '\\') {
          if (i + 1 < len) {
            emit(source[i + 1]);
            i += 2;
          } else {
            i++;
          }
          break;
        }
        if (ch === '\'') {
          state = 'normal';
        }
        i++;
        break;
      }

      case 'string_double': {
        emit(ch);
        if (ch === '\\') {
          if (i + 1 < len) {
            emit(source[i + 1]);
            i += 2;
          } else {
            i++;
          }
          break;
        }
        if (ch === '"') {
          state = 'normal';
        }
        i++;
        break;
      }

      case 'template_literal': {
        if (ch === '\\') {
          emit(ch);
          if (i + 1 < len) {
            emit(source[i + 1]);
            i += 2;
          } else {
            i++;
          }
          break;
        }
        if (ch === '`') {
          // End of template literal
          emit(ch);
          if (stateStack.length > 0) {
            const frame = stateStack.pop();
            state = frame.state;
            templateBraceDepth = frame.braceDepth;
          } else {
            state = 'normal';
          }
          i++;
          break;
        }
        if (ch === '$' && next === '{') {
          // Start of template expression — emit $ and {
          emit(ch);   // emit '$'
          emit(next); // emit '{'
          i += 2;
          stateStack.push({ state: 'template_literal', braceDepth: templateBraceDepth });
          state = 'template_expr';
          templateBraceDepth = 1;
          break;
        }
        // All other characters inside the template literal
        emit(ch);
        i++;
        break;
      }

      case 'template_expr': {
        // Inside ${...} — this is normal JS/TS code, so handle comments, strings, etc.
        // We track brace depth to know when we exit back to the template literal.

        // Line comment inside template expression
        if (ch === '/' && next === '/') {
          state = 'line_comment_in_expr';
          i += 2;
          break;
        }
        // Block comment inside template expression
        if (ch === '/' && next === '*') {
          state = 'block_comment_in_expr';
          i += 2;
          break;
        }

        // Nested template literal inside expression
        if (ch === '`') {
          emit(ch);
          i++;
          stateStack.push({ state: 'template_expr', braceDepth: templateBraceDepth });
          state = 'template_literal';
          templateBraceDepth = 0;
          break;
        }

        // Strings inside template expr
        if (ch === '\'') {
          emit(ch);
          i++;
          stateStack.push({ state: 'template_expr', braceDepth: templateBraceDepth });
          state = 'string_single_in_expr';
          break;
        }
        if (ch === '"') {
          emit(ch);
          i++;
          stateStack.push({ state: 'template_expr', braceDepth: templateBraceDepth });
          state = 'string_double_in_expr';
          break;
        }

        if (ch === '{') {
          templateBraceDepth++;
          emit(ch);
          i++;
          break;
        }
        if (ch === '}') {
          templateBraceDepth--;
          if (templateBraceDepth === 0) {
            // End of template expression, back to template literal
            emit(ch);
            i++;
            const frame = stateStack.pop();
            state = frame ? frame.state : 'template_literal';
            templateBraceDepth = frame ? frame.braceDepth : 0;
            break;
          }
          emit(ch);
          i++;
          break;
        }

        emit(ch);
        i++;
        break;
      }

      case 'line_comment_in_expr': {
        if (ch === '\n') {
          emit(ch);
          state = 'template_expr';
        }
        i++;
        break;
      }

      case 'block_comment_in_expr': {
        if (ch === '*' && next === '/') {
          i += 2;
          state = 'template_expr';
          break;
        }
        if (ch === '\n') emit('\n');
        i++;
        break;
      }

      case 'string_single_in_expr': {
        emit(ch);
        if (ch === '\\') {
          if (i + 1 < len) { emit(source[i + 1]); i += 2; } else i++;
          break;
        }
        if (ch === '\'') {
          const frame = stateStack.pop();
          state = frame ? frame.state : 'template_expr';
          templateBraceDepth = frame ? frame.braceDepth : templateBraceDepth;
        }
        i++;
        break;
      }

      case 'string_double_in_expr': {
        emit(ch);
        if (ch === '\\') {
          if (i + 1 < len) { emit(source[i + 1]); i += 2; } else i++;
          break;
        }
        if (ch === '"') {
          const frame = stateStack.pop();
          state = frame ? frame.state : 'template_expr';
          templateBraceDepth = frame ? frame.braceDepth : templateBraceDepth;
        }
        i++;
        break;
      }

      case 'regex_literal': {
        emit(ch);
        if (ch === '\\') {
          // Escaped char inside regex
          if (i + 1 < len) {
            emit(source[i + 1]);
            i += 2;
          } else {
            i++;
          }
          break;
        }
        if (ch === '[') {
          regexInCharClass = true;
          i++;
          break;
        }
        if (ch === ']') {
          regexInCharClass = false;
          i++;
          break;
        }
        // / ends regex only if NOT inside character class
        if (ch === '/' && !regexInCharClass) {
          // Consume regex flags: g, i, m, s, u, v, y, d
          i++;
          while (i < len && /[gimsuvyd]/.test(source[i])) {
            emit(source[i]);
            i++;
          }
          state = 'normal';
          break;
        }
        if (ch === '\n') {
          // Newline inside regex is invalid; bail back to normal
          state = 'normal';
        }
        i++;
        break;
      }

      default:
        emit(ch);
        i++;
        break;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// CSS comment stripper
// ---------------------------------------------------------------------------

function stripCSS(source) {
  const len = source.length;
  let out = '';
  let i = 0;
  let state = 'normal';

  while (i < len) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : '';

    switch (state) {
      case 'normal': {
        if (ch === '/' && next === '*') {
          state = 'block_comment';
          i += 2;
          break;
        }
        if (ch === '"') {
          state = 'string_double';
          out += ch;
          i++;
          break;
        }
        if (ch === '\'') {
          state = 'string_single';
          out += ch;
          i++;
          break;
        }
        if (ch === 'u' && source.slice(i, i + 4) === 'url(') {
          out += 'url(';
          i += 4;
          const peekI = i;
          let ws = 0;
          while (peekI + ws < len && (source[peekI + ws] === ' ' || source[peekI + ws] === '\t')) ws++;
          const afterWs = source[peekI + ws];
          if (afterWs === '"' || afterWs === '\'') {
            break;
          }
          state = 'url_unquoted';
          break;
        }
        out += ch;
        i++;
        break;
      }

      case 'block_comment': {
        if (ch === '*' && next === '/') {
          i += 2;
          state = 'normal';
          break;
        }
        if (ch === '\n') out += '\n';
        i++;
        break;
      }

      case 'string_double': {
        out += ch;
        if (ch === '\\' && i + 1 < len) {
          out += source[i + 1];
          i += 2;
          break;
        }
        if (ch === '"') state = 'normal';
        i++;
        break;
      }

      case 'string_single': {
        out += ch;
        if (ch === '\\' && i + 1 < len) {
          out += source[i + 1];
          i += 2;
          break;
        }
        if (ch === '\'') state = 'normal';
        i++;
        break;
      }

      case 'url_unquoted': {
        out += ch;
        if (ch === ')') state = 'normal';
        i++;
        break;
      }

      default:
        out += ch;
        i++;
        break;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// HTML comment stripper
// ---------------------------------------------------------------------------

function stripHTML(source) {
  let out = '';
  let i = 0;
  const len = source.length;

  while (i < len) {
    // HTML comment <!-- ... -->
    if (source[i] === '<' && source[i+1] === '!' && source[i+2] === '-' && source[i+3] === '-') {
      const end = source.indexOf('-->', i + 4);
      if (end === -1) { out += source.slice(i); break; }
      // Preserve newlines so line numbers stay roughly intact
      const skipped = source.slice(i, end + 3);
      out += '\n'.repeat((skipped.match(/\n/g) || []).length);
      i = end + 3;
      continue;
    }

    // <style ...> block — feed content through CSS stripper
    if (source[i] === '<') {
      const styleOpen = source.slice(i).match(/^<style(\s[^>]*)?\s*>/i);
      if (styleOpen) {
        const openTag = styleOpen[0];
        out += openTag;
        i += openTag.length;
        const closeIdx = source.toLowerCase().indexOf('</style>', i);
        if (closeIdx === -1) { out += source.slice(i); break; }
        out += stripCSS(source.slice(i, closeIdx));
        out += '</style>';
        i = closeIdx + 8;
        continue;
      }

      // <script ...> block — feed content through JS/TS stripper
      const scriptOpen = source.slice(i).match(/^<script(\s[^>]*)?\s*>/i);
      if (scriptOpen) {
        const openTag = scriptOpen[0];
        out += openTag;
        i += openTag.length;
        const closeIdx = source.toLowerCase().indexOf('</script>', i);
        if (closeIdx === -1) { out += source.slice(i); break; }
        out += stripTS(source.slice(i, closeIdx));
        out += '</script>';
        i = closeIdx + 9;
        continue;
      }
    }

    out += source[i];
    i++;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

/**
 * Post-process stripped source:
 * 1. Remove trailing whitespace from each line.
 * 2. Collapse 3+ consecutive blank lines into 2.
 * 3. Preserve final newline if original had one.
 */
function postProcess(source, hadFinalNewline) {
  // Detect line ending style (use CRLF if majority, else LF)
  const crlfCount = (source.match(/\r\n/g) || []).length;
  const lfCount = (source.match(/(?<!\r)\n/g) || []).length;
  const useCRLF = crlfCount > lfCount;

  // Split preserving line endings
  // Normalize to \n for processing, convert back at end
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // Remove trailing whitespace from each line
  const trimmed = lines.map(l => l.replace(/[ \t]+$/, ''));

  // Collapse 3+ consecutive blank lines into 2
  const collapsed = [];
  let blankRun = 0;
  for (const line of trimmed) {
    if (line === '') {
      blankRun++;
      if (blankRun <= 2) {
        collapsed.push(line);
      }
      // else skip (collapse)
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  // Join with correct line ending
  const sep = useCRLF ? '\r\n' : '\n';
  let result = collapsed.join(sep);

  // Restore final newline if original had one
  if (hadFinalNewline && !result.endsWith(sep)) {
    result += sep;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Glob expansion
// ---------------------------------------------------------------------------

/**
 * Expand a glob pattern or exact path to a list of file paths.
 * Supports:
 *   - Exact file paths
 *   - Patterns with ** (recursive), * (single segment wildcard), ? (single char)
 */
function expandGlob(pattern) {
  // If no glob chars, treat as exact path
  if (!pattern.includes('*') && !pattern.includes('?')) {
    try {
      const stat = statSync(pattern);
      if (stat.isFile()) return [resolve(pattern)];
      if (stat.isDirectory()) {
        // Walk directory recursively, return all .rs/.ts/.tsx files
        return walkDir(resolve(pattern), () => true);
      }
    } catch {
      // File doesn't exist
      return [];
    }
  }

  // Convert glob to regex
  const absPattern = resolve(pattern);
  const parts = absPattern.split('/');

  // Find the base directory (non-glob prefix)
  let baseIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('*') || parts[i].includes('?')) {
      baseIdx = i;
      break;
    }
    baseIdx = i + 1;
  }

  const baseDir = parts.slice(0, baseIdx).join('/') || '/';
  const globPart = parts.slice(baseIdx).join('/');
  const regexStr = globToRegex(globPart);
  const regex = new RegExp('^' + regexStr + '$');

  return walkDir(baseDir, (relPath) => regex.test(relPath));
}

/**
 * Convert a glob pattern to a regex string.
 * Supports ** (any path), * (any non-slash chars), ? (single non-slash char).
 */
function globToRegex(glob) {
  let result = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      // ** matches any path including slashes
      result += '.*';
      i += 2;
      // Skip trailing slash after **
      if (glob[i] === '/') i++;
    } else if (ch === '*') {
      result += '[^/]*';
      i++;
    } else if (ch === '?') {
      result += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      result += '\\' + ch;
      i++;
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

/**
 * Recursively walk a directory, returning files whose relative path matches predicate.
 */
function walkDir(dir, predicate) {
  const results = [];
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        const rel = full.slice(dir.length + 1); // relative to base
        if (predicate(rel)) {
          results.push(full);
        }
      }
    }
  }
  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = argv.slice(2);

  if (args.length === 0) {
    stdout.write('Usage: node strip-comments.mjs [--dry-run] <glob-or-path> [<glob-or-path> ...]\nSupported: .rs  .ts  .tsx  .css  .js  .html\n');
    exit(1);
  }

  let dryRun = false;
  const patterns = [];

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else {
      patterns.push(arg);
    }
  }

  if (patterns.length === 0) {
    stdout.write('Error: no paths or globs specified.\n');
    exit(1);
  }

  // Collect all files
  const allFiles = new Set();
  for (const pattern of patterns) {
    const expanded = expandGlob(pattern);
    for (const f of expanded) {
      allFiles.add(f);
    }
  }

  // Filter to supported extensions
  const supportedExts = new Set(['.rs', '.ts', '.tsx', '.css', '.js', '.html']);
  const files = [...allFiles].filter(f => supportedExts.has(extname(f)));

  if (files.length === 0) {
    stdout.write('No matching .rs/.ts/.tsx/.css/.js/.html files found.\n');
    return;
  }

  let totalProcessed = 0;
  let totalBytesSaved = 0;
  let totalChanged = 0;

  for (const filePath of files) {
    let source;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch (err) {
      stdout.write(`  SKIP ${filePath}: ${err.message}\n`);
      continue;
    }

    const ext = extname(filePath);
    const lang = ext === '.rs' ? 'rust' : ext === '.css' ? 'css' : ext === '.html' ? 'html' : 'ts';

    const hadFinalNewline = source.endsWith('\n') || source.endsWith('\r\n');

    let stripped;
    try {
      stripped = lang === 'rust' ? stripRust(source) : lang === 'css' ? stripCSS(source) : lang === 'html' ? stripHTML(source) : stripTS(source);
    } catch (err) {
      stdout.write(`  ERROR ${filePath}: ${err.message}\n`);
      continue;
    }

    const processed = postProcess(stripped, hadFinalNewline);

    const bytesBefore = Buffer.byteLength(source, 'utf8');
    const bytesAfter = Buffer.byteLength(processed, 'utf8');
    const saved = bytesBefore - bytesAfter;

    totalProcessed++;

    if (processed === source) {
      // No change
      if (dryRun) {
        stdout.write(`  unchanged  ${filePath}\n`);
      }
      continue;
    }

    totalChanged++;
    totalBytesSaved += saved;

    if (dryRun) {
      stdout.write(`  would strip  ${filePath}  (${saved >= 0 ? '-' : '+'}${Math.abs(saved)} bytes)\n`);
    } else {
      try {
        writeFileSync(filePath, processed, 'utf8');
        stdout.write(`  stripped  ${filePath}  (${saved >= 0 ? '-' : '+'}${Math.abs(saved)} bytes)\n`);
      } catch (err) {
        stdout.write(`  ERROR writing ${filePath}: ${err.message}\n`);
      }
    }
  }

  stdout.write('\n');
  stdout.write(`Summary:\n`);
  stdout.write(`  Files processed : ${totalProcessed}\n`);
  stdout.write(`  Files changed   : ${totalChanged}\n`);
  stdout.write(`  Bytes saved     : ${totalBytesSaved}\n`);
  if (dryRun) {
    stdout.write(`  (dry run — no files written)\n`);
  }
}

main();
