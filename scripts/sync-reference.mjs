// Copies the generated reference from the code repo at the ref in
// reference.json: docs/reference/*.md (written there by backend/cmd/docgen),
// its Turkish pages docs/reference/tr/*.md (to the tr locale's reference/)
// and backend/internal/api/openapi.yaml (the endpoint reference is generated
// from it at build time). The copies are committed.
//   npm run reference:sync    write them
//   npm run reference:check   fail when the committed copies differ (CI)
// GITHUB_TOKEN (set in CI) raises the API rate limit.
import {readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, existsSync} from 'node:fs';

const root = new URL('..', import.meta.url);
const {repo, ref} = JSON.parse(readFileSync(new URL('reference.json', root), 'utf8'));
const check = process.argv.includes('--check');
const headers = {'User-Agent': 'openconsole-docs'};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function get(url, json) {
  const res = await fetch(url, {headers: json ? {...headers, Accept: 'application/vnd.github+json'} : headers});
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
  return json ? res.json() : res.text();
}

const raw = (path) => get(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`);
// code repo directory → local directory (the Turkish copy goes to the tr locale)
const dirs = {
  'docs/reference': 'docs/reference/',
  'docs/reference/tr': 'i18n/tr/docusaurus-plugin-content-docs/current/reference/',
};
const files = {};
for (const [from, to] of Object.entries(dirs)) {
  const listing = await get(`https://api.github.com/repos/${repo}/contents/${from}?ref=${ref}`, true);
  for (const f of listing.filter((f) => f.type === 'file' && f.name.endsWith('.md'))) files[`${to}${f.name}`] = await raw(f.path);
}
files['openapi/openapi.yaml'] = await raw('backend/internal/api/openapi.yaml');

const local = Object.values(dirs).flatMap((d) =>
  existsSync(new URL(d, root)) ? readdirSync(new URL(d, root)).filter((n) => n.endsWith('.md')).map((n) => `${d}${n}`) : [],
);
const stale = local.filter((p) => !(p in files));
const differ = Object.entries(files).filter(([p, text]) => {
  try {
    return readFileSync(new URL(p, root), 'utf8') !== text;
  } catch {
    return true;
  }
});
if (check) {
  if (differ.length || stale.length) {
    console.error(`Out of date with ${repo}@${ref}: ${[...differ.map(([p]) => p), ...stale].join(', ')}\nRun: npm run reference:sync`);
    process.exit(1);
  }
  console.log(`reference matches ${repo}@${ref.slice(0, 12)}`);
} else {
  for (const [p, text] of differ) {
    mkdirSync(new URL('.', new URL(p, root)), {recursive: true});
    writeFileSync(new URL(p, root), text);
  }
  for (const p of stale) rmSync(new URL(p, root));
  console.log(`synced ${Object.keys(files).length} files from ${repo}@${ref.slice(0, 12)} (${differ.length} changed, ${stale.length} removed)`);
}
