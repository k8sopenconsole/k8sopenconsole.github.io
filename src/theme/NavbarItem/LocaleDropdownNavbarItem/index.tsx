import type {ReactNode} from 'react';
import clsx from 'clsx';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useAlternatePageUtils} from '@docusaurus/theme-common/internal';
import {useHistorySelector} from '@docusaurus/theme-common';
import IconLanguage from '@theme/Icon/Language';
import styles from './styles.module.css';

// The language switch as the app draws it: "EN | TR" side by side instead of a
// dropdown. Each link opens the same page (query and #section kept) in that locale.
export default function LocaleToggle({mobile}: {mobile?: boolean}): ReactNode {
  const {
    i18n: {currentLocale, locales, localeConfigs},
  } = useDocusaurusContext();
  const alternate = useAlternatePageUtils();
  const search = useHistorySelector((h) => h.location.search);
  const hash = useHistorySelector((h) => h.location.hash);
  const label = currentLocale === 'tr' ? 'Dil' : 'Language';
  return (
    <div className={clsx(styles.toggle, mobile ? 'menu__list-item' : 'navbar__item')} role="group" aria-label={label}>
      <IconLanguage className={styles.icon} aria-hidden="true" />
      {locales.map((locale) => {
        const active = locale === currentLocale;
        return (
          <a
            key={locale}
            // a plain link: the other locale is a separate build, so it must be a full page load
            href={`${alternate.createUrl({locale, fullyQualified: false})}${search}${hash}`}
            hrefLang={localeConfigs[locale]?.htmlLang}
            lang={localeConfigs[locale]?.htmlLang}
            aria-current={active ? 'true' : undefined}
            title={localeConfigs[locale]?.label}
            className={clsx(styles.option, active && styles.active)}>
            {locale.toUpperCase()}
          </a>
        );
      })}
    </div>
  );
}
