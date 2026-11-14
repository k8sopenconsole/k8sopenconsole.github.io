// The endpoint reference must have one page per operation of the OpenAPI
// description (M21 acceptance): two operations with the same summary would
// share one page, and a page would silently go missing. Run after
// `npm run build` (it counts the generated pages and the built ones). Checked
// for "Next" (docs/) and every frozen version (versioned_docs/, openapi/versions/).
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import yaml from 'js-yaml';

const root = new URL('..', import.meta.url);
const versions = existsSync(new URL('versions.json', root)) ? JSON.parse(readFileSync(new URL('versions.json', root), 'utf8')) : [];
const methods = ['get', 'post', 'put', 'patch', 'delete'];
// [label, spec, generated dir, built dir or null when that version isn't in this build]
const sets = [
  ['next', 'openapi/openapi.yaml', 'docs/api/endpoints/', versions.length === 0 ? 'build/api/endpoints/' : existsSync(new URL('build/next', root)) ? 'build/next/api/endpoints/' : null],
  ...versions.map((v, i) => [v, `openapi/versions/${v}.yaml`, `versioned_docs/version-${v}/api/endpoints/`, i === 0 ? 'build/api/endpoints/' : `build/${v}/api/endpoints/`]),
];
let failed = false;
for (const [label, specFile, dir, builtDir] of sets) {
  const spec = yaml.load(readFileSync(new URL(specFile, root), 'utf8'));
  const ops = Object.values(spec.paths).reduce((n, item) => n + methods.filter((m) => m in item).length, 0);
  const ids = readdirSync(new URL(dir, root)).filter((f) => f.endsWith('.api.mdx')).map((f) => f.replace(/\.api\.mdx$/, ''));
  const built = builtDir
    ? ids.filter((id) => existsSync(new URL(`${builtDir}${id}.html`, root)) || existsSync(new URL(`${builtDir}${id}/index.html`, root))).length
    : ops;
  console.log(`${label}: operations in ${specFile}: ${ops}; endpoint pages generated: ${ids.length}; built: ${builtDir ? built : 'not in this build'}`);
  if (ids.length !== ops || built !== ops) failed = true;
}
if (failed) {
  console.error('The endpoint reference does not have one page per operation (duplicate summary?).');
  process.exit(1);
}
