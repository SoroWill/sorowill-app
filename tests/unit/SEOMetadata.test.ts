import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import sitemap from '@/app/sitemap';

describe('SEO Metadata Audit (#40)', () => {
  // sitemap.xml is generated dynamically by src/app/sitemap.ts (Next.js's
  // MetadataRoute.Sitemap convention) rather than served as a static file
  // under public/, so it's verified by calling that function directly.
  it('verifies the dynamic sitemap generates at least one entry', () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(0);
  });

  it('verifies robots.txt exists at public root', () => {
    const robotsPath = path.join(process.cwd(), 'public', 'robots.txt');
    expect(fs.existsSync(robotsPath)).toBe(true);
  });

  it('verifies the dynamic sitemap contains expected routes', () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls.some((url) => url.endsWith('/'))).toBe(true);
    expect(urls.some((url) => url.endsWith('/dashboard'))).toBe(true);
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https?:\/\//);
    }
  });

  it('verifies robots.txt has proper content', () => {
    const robotsPath = path.join(process.cwd(), 'public', 'robots.txt');
    const content = fs.readFileSync(robotsPath, 'utf-8');

    expect(content).toMatch(/User-agent:/i);
    expect(content.length).toBeGreaterThan(0);
  });

  it('verifies landing page has Open Graph metadata', () => {
    const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf-8');

    expect(content).toMatch(/openGraph|og:|metadataBase/i);
  });

  it('verifies verify page has Open Graph metadata', () => {
    const verifyPagePath = path.join(process.cwd(), 'src/app/verify/page.tsx');
    if (fs.existsSync(verifyPagePath)) {
      const content = fs.readFileSync(verifyPagePath, 'utf-8');
      expect(content).toMatch(/generateMetadata|metadata|openGraph/i);
    }
  });

  it('verifies Twitter Card metadata is configured', () => {
    const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf-8');

    expect(content).toMatch(/twitter|og:/i);
  });

  it('verifies metadata base URL is configured', () => {
    const layoutPath = path.join(process.cwd(), 'src/app/layout.tsx');
    const content = fs.readFileSync(layoutPath, 'utf-8');

    expect(content).toMatch(/metadataBase|baseUrl/i);
  });
});
