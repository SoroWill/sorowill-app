import type { MetadataRoute } from 'next';

const BASE_URL = 'https://sorowill.vercel.app';

type SitemapEntry = MetadataRoute.Sitemap[number];

interface PublicRoute {
  path: string;
  changeFrequency: SitemapEntry['changeFrequency'];
  priority: number;
}

// === Public routes
// Keep in sync with the publicly indexable pages under src/app. Routes that
// need a specific record id (/will/[id], /inherit/[id], /verify/[id]) and the
// guardian onboarding flow are intentionally excluded.
const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/dashboard', changeFrequency: 'daily', priority: 0.8 },
  { path: '/will/new', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/stats', changeFrequency: 'daily', priority: 0.6 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/changelog', changeFrequency: 'weekly', priority: 0.5 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
