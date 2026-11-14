// Docusaurus writes one sitemap per locale (build/sitemap.xml, build/tr/sitemap.xml).
// After the build this merges them into build/sitemap.xml: every page of both
// languages, one element per line. The language pairs (hreflang en / tr /
// x-default) are in every page's <head>, which search engines read; repeating them
// here as xhtml:link would make browsers render the file as run-together text.
// The search page is left out.
import {readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';

const build = new URL('../build/', import.meta.url);
const SITE = 'https://k8sopenconsole.github.io';
const locs = (file) =>
  existsSync(new URL(file, build))
    ? [...readFileSync(new URL(file, build), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    : [];
const en = locs('sitemap.xml').filter((u) => !u.startsWith(`${SITE}/tr/`));
const tr = new Set(locs('tr/sitemap.xml'));
const toTr = (u) => u.replace(SITE, `${SITE}/tr`);
const pages = en.filter((u) => !/\/search$/.test(u));

const urls = pages.flatMap((u) => [u, ...(tr.has(toTr(u)) ? [toTr(u)] : [])]);
writeFileSync(
  new URL('sitemap.xml', build),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) => `  <url><loc>${u}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n'),
);
// The tr build's own sitemap would be a second, partial one.
rmSync(new URL('tr/sitemap.xml', build), {force: true});
console.log(`sitemap: ${urls.length} URLs (${pages.length} pages, en + tr)`);
