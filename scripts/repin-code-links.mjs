// Moves links to code lines (blob/<old tag>/<path>#L12-L20) to a new release tag:
//   node scripts/repin-code-links.mjs v2.22.0 v2.23.0
// For each link the lines at the old tag are looked up in the file at the new tag;
// found once → the link gets the new tag and line numbers; otherwise it is listed
// for a manual check and left as it is. Edits docs/ and i18n/*/…/current/.
import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error('usage: node scripts/repin-code-links.mjs <old tag> <new tag>');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const repo = 'vurulkan/kubernetes-openconsole';
const cache = {};
const file = async (tag, path) => {
  const key = `${tag}:${path}`;
  if (!(key in cache)) {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${tag}/${path}`);
    cache[key] = res.ok ? (await res.text()).split('\n') : null;
  }
  return cache[key];
};

const dirs = ['docs', ...readdirSync(join(root, 'i18n')).map((l) => `i18n/${l}/docusaurus-plugin-content-docs/current`)];
const pages = dirs.flatMap((d) =>
  readdirSync(join(root, d), {recursive: true}).filter((f) => /\.mdx?$/.test(f) && !f.startsWith('api/endpoints')).map((f) => join(root, d, f)),
);
const re = new RegExp(`blob/${from.replace(/\./g, '\\.')}/([^#)\\s]+)(?:#L(\\d+)(?:-L(\\d+))?)?`, 'g');
const manual = [];
let moved = 0;
for (const page of pages) {
  const text = readFileSync(page, 'utf8');
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const [link, path, a, b] = m;
    let out = `blob/${to}/${path}`;
    if (a) {
      const oldLines = await file(from, path);
      const newLines = await file(to, path);
      const start = Number(a), end = Number(b ?? a);
      const block = oldLines?.slice(start - 1, end).join('\n');
      const hits = [];
      if (block && newLines) {
        for (let i = 0; i + (end - start) < newLines.length; i++) {
          if (newLines.slice(i, i + end - start + 1).join('\n') === block) hits.push(i + 1);
        }
      }
      if (hits.length === 1) {
        const n = hits[0];
        out += b ? `#L${n}-L${n + end - start}` : `#L${n}`;
      } else {
        manual.push(`${page.slice(root.length)}: ${link} (${hits.length} matches at ${to})`);
        out = link;
      }
    }
    if (out !== link) moved++;
    parts.push(text.slice(last, m.index), out);
    last = m.index + link.length;
  }
  parts.push(text.slice(last));
  const next = parts.join('');
  if (next !== text) writeFileSync(page, next);
}
console.log(`moved ${moved} link(s) from ${from} to ${to}`);
for (const m of manual) console.log(`check by hand: ${m}`);
if (manual.length) process.exitCode = 1;
