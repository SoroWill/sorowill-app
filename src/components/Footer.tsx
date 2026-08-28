import Link from 'next/link';
import { NetworkBadge } from '@/components/NetworkBadge';

export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-4 border-t border-white/10 pt-8 pb-8 text-center text-sm text-will-light/50">
      <div className="flex items-center gap-2">
        <p>SoroWill, built on Stellar</p>
        <NetworkBadge />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <a href="https://github.com/SoroWill/sorowill-app" target="_blank" rel="noreferrer" className="hover:text-will-light">
          GitHub
        </a>
        <span className="text-white/20">•</span>
        <Link href="/terms" className="hover:text-will-light">
          Terms of Use
        </Link>
        <span className="text-white/20">•</span>
        <Link href="/privacy" className="hover:text-will-light">
          Privacy Policy
        </Link>
        <span className="text-white/20">•</span>
        <Link href="/changelog" className="hover:text-will-light">
          Changelog
        </Link>
        <span className="text-white/20">•</span>
        <Link href="/stats" className="hover:text-will-light">
          Stats
        </Link>
        <span className="text-white/20">•</span>
        <Link href="/faq" className="hover:text-will-light">
          FAQ
        </Link>
        <span className="text-white/20">•</span>
        <span>MIT License</span>
      </div>
    </footer>
  );
}
