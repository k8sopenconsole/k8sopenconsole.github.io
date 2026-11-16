# OpenConsole for Kubernetes documentation

Source of the documentation site for [OpenConsole for Kubernetes](https://github.com/vurulkan/kubernetes-openconsole),
published at **https://k8sopenconsole.github.io/** in English and Turkish. Built with [Docusaurus 3](https://docusaurus.io/).

```bash
npm ci
npm start          # http://localhost:3000/, live reload (English only)
npm run build      # what CI runs: fails on a broken link or anchor
npm run serve      # serve the build (both locales, search works here)
npm start -- --locale tr               # the Turkish site, live reload
DOCS_NEXT=1 npm run build              # also build the unreleased "Next" docs (as PR previews do)
```

- Pages live in `docs/`, the sidebar in `sidebars.ts`, the home page in `src/pages/index.tsx`.
- `docs/release-notes.md` is generated from the code repo's GitHub releases before every build
  (`scripts/release-notes.mjs`); don't edit or commit it.
- Every pull request is built in CI (the site is attached as the `site-preview` artifact). A merge to `main`
  publishes the site. After a release of the code repo, refresh the release notes:
  `gh workflow run docs.yml -R k8sopenconsole/k8sopenconsole.github.io`.
- Every page has a Turkish translation under `i18n/tr/` (rules and terms: `i18n/tr/GLOSSARY.md`).
- Docs are versioned per minor release (`npm run docs:freeze -- X.Y`); the newest frozen version is the default, the
  unreleased "Next" (`docs/`) is only built for pull request previews.

## License

The documentation (the pages in `docs/` and `i18n/`, and the images) is licensed under
[CC BY 4.0](LICENSE). The code in this repository (`scripts/`, `src/`, `screenshots/`, the configuration) is licensed
under [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0), like
[OpenConsole](https://github.com/vurulkan/kubernetes-openconsole) itself. The OpenConsole name and logo are not
covered by either license: see [TRADEMARKS.md](https://github.com/vurulkan/kubernetes-openconsole/blob/main/TRADEMARKS.md).
Contributions are accepted under these licenses, with a DCO sign-off (`git commit -s`).

