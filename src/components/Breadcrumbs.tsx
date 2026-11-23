import Link from 'next/link';

const pageLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/will/new': 'Create a Will',
  '/faq': 'FAQ',
  '/terms': 'Terms',
  '/privacy': 'Privacy',
  '/stats': 'Statistics',
  '/changelog': 'Changelog',
  '/guardian/onboard': 'Guardian Setup',
};

export function Breadcrumbs({ pathname }: { pathname: string }) {
  let label = pageLabels[pathname];
  let dashboardParent = pathname === '/will/new';
  if (/^\/will\/[^/]+$/.test(pathname) && !label) {
    label = 'Will Details';
    dashboardParent = true;
  }
  if (/^\/verify\/[^/]+$/.test(pathname)) label = 'Verify Will';
  if (/^\/inherit\/[^/]+$/.test(pathname)) label = 'Claim Inheritance';

  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-will-light/80">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li>
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined} className="underline">Home</Link>
        </li>
        {dashboardParent && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            <Link href="/dashboard" className="underline">Dashboard</Link>
          </li>
        )}
        {label && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            <span aria-current="page">{label}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
