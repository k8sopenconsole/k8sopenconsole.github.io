// Docusaurus writes one sitemap per locale (build/sitemap.xml, build/tr/sitemap.xml).
// After the build this merges them into build/sitemap.xml: every page of both
// languages, each with its hreflang alternates (en, tr, x-default = en), which is
// what search engines read for a translated site. The search page is left out.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';

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

const alt = (lang, href) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`;
const entry = (loc, enUrl) => {
  const links = [alt('en', enUrl), ...(tr.has(toTr(enUrl)) ? [alt('tr', toTr(enUrl))] : []), alt('x-default', enUrl)];
  return `<url><loc>${loc}</loc>${links.join('')}</url>`;
};
const urls = pages.flatMap((u) => [entry(u, u), ...(tr.has(toTr(u)) ? [entry(toTr(u), u)] : [])]);
writeFileSync(
  new URL('sitemap.xml', build),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>\n`,
);
console.log(`sitemap: ${urls.length} URLs (${pages.length} pages, en + tr)`);
