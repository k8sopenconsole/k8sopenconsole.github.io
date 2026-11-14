// Freezes the docs of a minor release: `npm run docs:freeze -- 2.23`.
// Run it when the release ships, with reference.json pinned to the release tag
// and `npm run reference:sync` done. It
//  - copies docs/ to versioned_docs/version-<X.Y> (docusaurus docs:version),
//    without the generated endpoint pages and release notes (made at build time),
//  - keeps the API description as openapi/versions/<X.Y>.yaml (the endpoint
//    pages of that version are generated from it),
//  - copies the Turkish pages and sidebar labels to version-<X.Y>,
//  - keeps the newest three versions; an older one is removed and listed in
//    versions-archived.json (the version menu links to its source at the
//    docs-<X.Y> tag of this repo).
// Patch releases don't freeze: edit versioned_docs/version-<X.Y> (and its tr copy).
import {execSync} from 'node:child_process';
import {cpSync, existsSync, readFileSync, rmSync, writeFileSync, copyFileSync, mkdirSync} from 'node:fs';

const KEEP = 3;
const version = process.argv[2];
if (!/^\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: npm run docs:freeze -- <major.minor>   (e.g. 2.23)');
  process.exit(1);
}
const root = new URL('..', import.meta.url);
const at = (p) => new URL(p, root);
const read = (p, fallback) => (existsSync(at(p)) ? JSON.parse(readFileSync(at(p), 'utf8')) : fallback);
const write = (p, v) => writeFileSync(at(p), JSON.stringify(v, null, 2) + '\n');
const run = (cmd) => execSync(cmd, {cwd: root, stdio: 'inherit'});

const {ref} = read('reference.json');
if (!ref.startsWith(`v${version}.`)) {
  console.error(`reference.json is pinned to ${ref}, not to a v${version}.x tag: pin it and run npm run reference:sync first.`);
  process.exit(1);
}
if (read('versions.json', []).includes(version)) {
  console.error(`${version} is frozen already; a patch release edits versioned_docs/version-${version}.`);
  process.exit(1);
}

run('npm run reference:check');
run('npm run api-docs'); // the endpoint sidebar of this version is snapshotted from it
run(`npx docusaurus docs:version ${version}`);

const dir = `versioned_docs/version-${version}`;
rmSync(at(`${dir}/api/endpoints`), {recursive: true, force: true});
rmSync(at(`${dir}/release-notes.md`), {force: true});
mkdirSync(at('openapi/versions'), {recursive: true});
copyFileSync(at('openapi/openapi.yaml'), at(`openapi/versions/${version}.yaml`));

const tr = 'i18n/tr/docusaurus-plugin-content-docs';
cpSync(at(`${tr}/current`), at(`${tr}/version-${version}`), {recursive: true});
const labels = read(`${tr}/current.json`, {});
labels['version.label'] = {message: version, description: `The label for version ${version}`};
write(`${tr}/version-${version}.json`, labels);

const versions = read('versions.json', []);
const archived = read('versions-archived.json', []);
for (const old of versions.slice(KEEP)) {
  rmSync(at(`versioned_docs/version-${old}`), {recursive: true, force: true});
  rmSync(at(`versioned_sidebars/version-${old}-sidebars.json`), {force: true});
  rmSync(at(`${tr}/version-${old}`), {recursive: true, force: true});
  rmSync(at(`${tr}/version-${old}.json`), {force: true});
  rmSync(at(`openapi/versions/${old}.yaml`), {force: true});
  archived.unshift(old);
  console.log(`archived ${old}: tag this repo's commit before the freeze as docs-${old}`);
}
write('versions.json', versions.slice(0, KEEP));
if (archived.length) write('versions-archived.json', archived);
console.log(`frozen ${version}; versions: ${versions.slice(0, KEEP).join(', ')}`);
