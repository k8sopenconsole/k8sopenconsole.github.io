import {existsSync, readFileSync} from 'node:fs';
import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type * as OpenApiPlugin from 'docusaurus-plugin-openapi-docs';

// Where the site is served. Moving it (custom domain, another repo) changes
// only these two lines, plus static/CNAME for a custom domain.
const SITE_URL = 'https://k8sopenconsole.github.io';
const BASE_URL = '/';

const CODE_REPO = 'https://github.com/vurulkan/kubernetes-openconsole';

// Docusaurus builds each locale on its own; the Open Graph image follows it.
const LOCALE = process.env.DOCUSAURUS_CURRENT_LOCALE ?? 'en';

// Frozen docs versions, newest first (npm run docs:freeze -- X.Y at a minor
// release); the newest is the default. "Next" (docs/, what dev holds) is built
// for pull request previews only (DOCS_NEXT=1), never published.
const json = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []);
const VERSIONS: string[] = json('versions.json');
const ARCHIVED: string[] = json('versions-archived.json');
const WITH_NEXT = VERSIONS.length === 0 || process.env.DOCS_NEXT === '1';
const DOCS_REPO = 'https://github.com/k8sopenconsole/k8sopenconsole.github.io';

// Endpoint pages per version, from the API description of that version.
const endpointDocs = (spec: string, outputDir: string): OpenApiPlugin.Options => ({
  specPath: spec,
  outputDir,
  sidebarOptions: {groupPathsBy: 'tag', categoryLinkSource: 'tag'},
  hideSendButton: true,
  showSchemas: false,
});

const config: Config = {
  title: 'Kubernetes OpenConsole',
  tagline:
    'A web console for several Kubernetes clusters, with access granted in the app and every action audited.',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: SITE_URL,
  baseUrl: BASE_URL,
  trailingSlash: false,

  organizationName: 'k8sopenconsole',
  projectName: 'k8sopenconsole.github.io',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  onDuplicateRoutes: 'throw',

  markdown: {
    // .md is plain CommonMark (release notes and README text may hold `<` and `{`);
    // .mdx for pages that use components.
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
      onBrokenMarkdownImages: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    // Turkish pages live in i18n/tr/ (rules and terms: i18n/tr/GLOSSARY.md); a page
    // without a translation shows the English one with a note.
    locales: ['en', 'tr'],
    localeConfigs: {
      en: {label: 'English', htmlLang: 'en'},
      tr: {label: 'Türkçe', htmlLang: 'tr'},
    },
  },

  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500;600&display=swap',
  ],

  clientModules: ['./src/clientModules/apiListRoles.ts'],

  plugins: [
    // Endpoint reference: one page per operation of the code repo's OpenAPI
    // description (openapi/openapi.yaml, copied by npm run reference:sync).
    // `npm run api-docs` writes docs/api/endpoints/ before start / build; it is
    // not committed.
    [
      'docusaurus-plugin-openapi-docs',
      {
        id: 'openapi',
        docsPluginId: 'classic',
        // *.site.yaml come from the committed *.yaml by scripts/openapi-site.mjs
        config: Object.fromEntries([
          ['openconsole', endpointDocs('openapi/openapi.site.yaml', 'docs/api/endpoints')],
          ...VERSIONS.map((v) => [
            `openconsole_${v.replace('.', '_')}`,
            endpointDocs(`openapi/versions/${v}.site.yaml`, `versioned_docs/version-${v}/api/endpoints`),
          ]),
        ]),
      },
    ],
  ],

  themes: [
    'docusaurus-theme-openapi-docs',
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en', 'tr'],
        indexBlog: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          docItemComponent: '@theme/ApiItem',
          editUrl: 'https://github.com/k8sopenconsole/k8sopenconsole.github.io/edit/main/',
          showLastUpdateTime: false,
          ...(VERSIONS.length > 0 && {
            lastVersion: VERSIONS[0],
            onlyIncludeVersions: WITH_NEXT ? ['current', ...VERSIONS] : VERSIONS,
            versions: {current: {label: 'Next', path: 'next', banner: 'unreleased'}},
          }),
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: `img/og-${LOCALE === 'tr' ? 'tr' : 'en'}.png`,
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'OpenConsole',
      logo: {
        alt: 'Kubernetes OpenConsole',
        src: 'img/logo.svg',
      },
      items: [
        {type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs'},
        {to: '/release-notes', label: 'Release notes', position: 'left'},
        ...(VERSIONS.length > 0
          ? [
              {
                type: 'docsVersionDropdown',
                position: 'right' as const,
                // Older docs: the frozen sources at the docs-X.Y tag; 2.22 and older were the README.
                dropdownItemsAfter: [
                  ...ARCHIVED.map((v) => ({href: `${DOCS_REPO}/tree/docs-${v}/versioned_docs/version-${v}`, label: v})),
                  {href: `${CODE_REPO}/blob/v2.22.0/README.md`, label: '2.22 and older (README)'},
                ],
              },
            ]
          : []),
        {type: 'localeDropdown', position: 'right'},
        {href: CODE_REPO, label: 'GitHub', position: 'right'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Quick start', to: '/getting-started/quick-start'},
            {label: 'Install on Kubernetes', to: '/installation/kubernetes'},
            {label: 'API and agents', to: '/api/overview'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'Source code', href: CODE_REPO},
            {label: 'Releases', href: `${CODE_REPO}/releases`},
            {label: 'Issues', href: `${CODE_REPO}/issues`},
          ],
        },
      ],
      copyright: `Kubernetes OpenConsole. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json', 'sql', 'ruby'],
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
    // Code samples on the endpoint pages, curl first.
    languageTabs: [
      {highlight: 'bash', language: 'curl', logoClass: 'curl'},
      {highlight: 'python', language: 'python', logoClass: 'python'},
      {highlight: 'go', language: 'go', logoClass: 'go'},
      {highlight: 'javascript', language: 'nodejs', logoClass: 'nodejs'},
    ],
  } satisfies Preset.ThemeConfig,
};

export default config;
