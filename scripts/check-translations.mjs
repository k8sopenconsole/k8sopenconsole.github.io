// Lists the English pages that have no Turkish translation (and Turkish pages
// whose English page is gone), and translated pages that don't carry the English
// page's code blocks, heading anchors, link targets and screenshots unchanged
// (a translation moves the words, never the commands). It never fails the build: a missing page falls
// back to English with a "not translated" note (src/theme/DocVersionBanner).
// In CI the list goes to the job summary and as warnings on the PR.
//   npm run translations:check
import {readdirSync, existsSync, appendFileSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const locale = 'tr';
// English by design: generated from the API description / GitHub releases.
const english = (p) => p.startsWith('api/endpoints/') || p === 'release-notes.md';

function pages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, {recursive: true})
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => relative(dir, join(dir, f)).split('\\').join('/'));
}

// current docs + every frozen version
const sets = [['docs', 'current']];
if (existsSync(join(root, 'versioned_docs'))) {
  for (const v of readdirSync(join(root, 'versioned_docs'))) sets.push([`versioned_docs/${v}`, v]);
}

// What must be the same in both languages.
function skeleton(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
  // Mermaid diagrams are prose (their labels are translated); every other block is kept as is.
  const code = [...body.matchAll(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm)].map((m) => m[0]).filter((c) => !/^(```|~~~)mermaid/.test(c));
  const prose = body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
  // explicit id, or the slug Docusaurus makes from the heading text
  const slug = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/ /g, '-');
  const anchors = [...prose.matchAll(/^#{2,6} (.*?)\s*(?:\{#([^}]+)\}|\{\/\* #(\S+) \*\/\})?\s*$/gm)].map(
    (m) => m[2] || m[3] || slug(m[1]),
  );
  const headings = anchors.length;
  const links = [...prose.matchAll(/\]\(([^)\s]+)\)|href="([^"]+)"/g)].map((m) => m[1] || m[2]).sort();
  const shots = [...prose.matchAll(/<Screenshot\s+id="([^"]+)"/g)].map((m) => m[1]);
  return {code, anchors, headings, links, shots};
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const missing = [];
const orphans = [];
const drift = [];
for (const [src, name] of sets) {
  const tr = `i18n/${locale}/docusaurus-plugin-content-docs/${name}`;
  const en = pages(join(root, src)).filter((p) => !english(p));
  const have = new Set(pages(join(root, tr)).map((p) => p.replace(/\.mdx?$/, '')));
  const want = new Set(en.map((p) => p.replace(/\.mdx?$/, '')));
  for (const p of en) if (!have.has(p.replace(/\.mdx?$/, ''))) missing.push(`${src}/${p}`);
  for (const p of pages(join(root, tr))) {
    const enFile = en.find((e) => e.replace(/\.mdx?$/, '') === p.replace(/\.mdx?$/, ''));
    if (!enFile) continue;
    const a = skeleton(readFileSync(join(root, src, enFile), 'utf8'));
    const b = skeleton(readFileSync(join(root, tr, p), 'utf8'));
    const why = [];
    if (!same(a.code, b.code)) why.push('code blocks differ');
    if (!same(a.anchors, b.anchors) || a.headings !== b.headings) why.push('headings / anchors differ');
    if (!same(a.links, b.links)) why.push('link targets differ');
    if (!same(a.shots, b.shots)) why.push('screenshots differ');
    if (why.length) drift.push(`${tr}/${p}: ${why.join(', ')}`);
  }
  for (const p of have) if (!want.has(p)) orphans.push(`${tr}/${p}`);
}

const ci = !!process.env.GITHUB_ACTIONS;
for (const p of missing) console.log(ci ? `::warning file=${p}::No Turkish translation; the tr site shows the English page.` : `missing tr: ${p}`);
for (const p of orphans) console.log(ci ? `::warning file=${p}::Turkish page without an English page.` : `orphan tr: ${p}`);
for (const d of drift) {
  const [file, why] = d.split(': ');
  console.log(ci ? `::warning file=${file}::Not the same as the English page: ${why}.` : `drift: ${d}`);
}
console.log(`translations: ${missing.length} page(s) without Turkish, ${orphans.length} orphan(s), ${drift.length} differing from English`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const list = (xs) => xs.map((p) => `- \`${p}\``).join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Translations\n\n${missing.length ? `Pages without Turkish (shown in English on the tr site):\n\n${list(missing)}\n` : 'Every page has a Turkish translation.\n'}` +
    (orphans.length ? `\nTurkish pages without an English page:\n\n${list(orphans)}\n` : '') +
    (drift.length ? `\nTurkish pages whose code, anchors, links or screenshots differ from English:\n\n${list(drift)}\n` : ''));
}
