#!/usr/bin/env node
/* KHub encoding guard (static)
   Usage: node scripts/check-encoding.mjs <path-to-app-dir-or-file>

   Catches the "scribbling" class of bug: source that was UTF-8 but got
   decoded as Latin-1/Windows-1252 and re-saved (double-encoded UTF-8, aka
   mojibake). That corruption turns emoji, box-drawing dividers, dashes,
   and Spanish accents into garbage: one code point becomes a multi-character
   run whose bytes include C1 control code points (U+0080-U+009F).
   (This file deliberately contains no literal mojibake, so it passes its
   own check; the tests build corrupted samples from escape sequences.)

   Zero dependencies — runs on plain `node`, so it works in app repos that
   have no package.json. Exit 1 if any file is corrupted, 0 if clean. */

import fs from 'fs';
import path from 'path';

// Text formats we read as UTF-8. Binary (png/svg/ico/woff...) is skipped.
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.json',
  '.md', '.txt', '.webmanifest', '.yml', '.yaml', '.toml', '.svg',
]);

// Directories that never contain hand-authored source.
const SKIP_DIR = new Set(['.git', 'node_modules', 'icons']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* The reliable, false-positive-free signals of double-encoded UTF-8:
   - C1 control code points U+0080-U+009F appearing as characters. Genuine
     text never contains these; they only show up as the trailing bytes of
     a UTF-8 sequence that was reinterpreted as Latin-1.
   - U+FFFD REPLACEMENT CHARACTER, left behind by a lossy decode.
   Legit emoji and accented letters are single code points > U+00FF, so they
   are never flagged. */
export function scanText(text) {
  const issues = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const cp = line.codePointAt(j);
      const isC1 = cp >= 0x80 && cp <= 0x9f;
      const isRepl = cp === 0xfffd;
      if (isC1 || isRepl) {
        const start = Math.max(0, j - 12);
        issues.push({
          line: i + 1,
          col: j + 1,
          codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
          kind: isRepl ? 'replacement-char' : 'mojibake-c1',
          context: JSON.stringify(line.slice(start, j + 12)),
        });
      }
    }
  }
  return issues;
}

export function findEncodingIssues(files) {
  const report = [];
  for (const f of files) {
    if (!TEXT_EXT.has(path.extname(f).toLowerCase())) continue;
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const issues = scanText(text);
    if (issues.length) report.push({ file: f, issues });
  }
  return report;
}

// --- CLI ---
// import.meta.url matches argv[1] only when this file is run directly.
const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) {
  const target = process.argv[2] || '.';
  const stat = fs.statSync(target);
  const files = stat.isDirectory() ? walk(target) : [target];
  const report = findEncodingIssues(files);

  if (report.length === 0) {
    console.log(`encoding check: clean (${files.length} files scanned, no mojibake)`);
    process.exit(0);
  }

  let total = 0;
  for (const { file, issues } of report) {
    console.error(`\nFAIL ${file} - ${issues.length} corrupted character(s):`);
    for (const it of issues.slice(0, 8)) {
      console.error(`  line ${it.line}:${it.col}  ${it.codePoint} (${it.kind})  near ${it.context}`);
    }
    if (issues.length > 8) console.error(`  ... and ${issues.length - 8} more`);
    total += issues.length;
  }
  console.error(
    `\nencoding check FAILED: ${total} corrupted character(s) in ${report.length} file(s).`
  );
  console.error(
    'Cause: double-encoded UTF-8 (file decoded as Latin-1 and re-saved). ' +
      'Fix: re-decode the corrupted byte-runs (latin-1 -> utf-8), then re-save as UTF-8.'
  );
  process.exit(1);
}
