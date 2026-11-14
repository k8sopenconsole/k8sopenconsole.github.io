import type {ReactNode} from 'react';
import type {Props} from '@theme/DocVersionBanner';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// A page with no translation falls back to the English source; say so. A
// translated page's source is under i18n/<locale>/, a fallback's under docs/ or
// versioned_docs/ (endpoint pages and release notes are English by design).
export default function DocVersionBannerWrapper(props: Props): ReactNode {
  const {i18n} = useDocusaurusContext();
  const {metadata} = useDoc();
  const fallback = i18n.currentLocale !== i18n.defaultLocale && !metadata.source.startsWith('@site/i18n/');
  return (
    <>
      <DocVersionBanner {...props} />
      {fallback && i18n.currentLocale === 'tr' && (
        <div className="alert alert--secondary margin-bottom--md" role="note" lang="tr">
          Bu sayfa Türkçeye çevrilmedi; İngilizcesi gösteriliyor.
        </div>
      )}
    </>
  );
}
