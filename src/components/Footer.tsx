import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NetworkBadge } from '@/components/NetworkBadge';
import { checkLink } from '@/lib/antiPhishing';

export function Footer() {
  const t = useTranslations('common');
  // Safe link checking (#909): only render links that pass the anti-phishing check.
  const github = checkLink('https://github.com/SoroWill/sorowill-app');

  return (
    <footer className="flex w-full flex-col items-center gap-3 overflow-x-hidden border-t border-white/10 px-4 pt-8 pb-8 text-center text-sm text-will-light/50 sm:gap-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <p>{t('builtOnStellar')}</p>
        <NetworkBadge />
      </div>
      <nav
        aria-label={t('footerNav')}
        className="flex w-full max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-4"
      >
        {github.url ? (
          <a href={github.url} target="_blank" rel="noopener noreferrer" className="hover:text-will-light">
            {t('githubLink')}
          </a>
        ) : null}
        <span className="text-white/20" aria-hidden="true">
          •
        </span>
        <Link href="/terms" className="hover:text-will-light">
          {t('terms')}
        </Link>
        <span className="text-white/20" aria-hidden="true">
          •
        </span>
        <Link href="/privacy" className="hover:text-will-light">
          {t('privacy')}
        </Link>
        <span className="text-white/20" aria-hidden="true">
          •
        </span>
        <Link href="/changelog" className="hover:text-will-light">
          {t('changelog')}
        </Link>
        <span className="text-white/20" aria-hidden="true">
          •
        </span>
        <Link href="/stats" className="hover:text-will-light">
          {t('stats')}
        </Link>
        <span className="text-white/20" aria-hidden="true">
          •
        </span>
        <Link href="/faq" className="hover:text-will-light">
          {t('faq')}
        </Link>
        <span className="text-white/20" aria-hidden="true">
          •
        </span>
        <Link href="/help" className="hover:text-will-light">
          {t('help')}
        </Link>
        <span className="text-white/20" aria-hidden="true">
          •
        </span>
        <span>{t('mitLicense')}</span>
      </nav>
    </footer>
  );
}
