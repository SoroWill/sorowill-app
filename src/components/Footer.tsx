import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { NetworkBadge } from '@/components/NetworkBadge';
import { getSocialLinks } from '@/lib/socialLinks';

export function Footer() {
  const t = useTranslations('common');

  return (
    <footer className="flex flex-col items-center gap-4 border-t border-white/10 pt-8 pb-8 text-center text-sm text-will-light/50">
      <div className="flex items-center gap-2">
        <p>{t('builtOnStellar')}</p>
        <NetworkBadge />
      </div>
      <nav aria-label={t('footerNav')} className="flex flex-wrap items-center justify-center gap-4">
        {getSocialLinks().map((link) => (
          <span key={link.id} className="contents">
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:text-will-light">
              {t(`${link.id}Link`)}
            </a>
            <span className="text-white/20" aria-hidden="true">
              •
            </span>
          </span>
        ))}
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
        <span>{t('mitLicense')}</span>
      </nav>
    </footer>
  );
}
