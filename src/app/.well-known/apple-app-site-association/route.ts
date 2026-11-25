import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

/**
 * Serves the iOS Universal Links association file with the
 * `application/json` content type Apple requires (extensionless file).
 */
export function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appIDs: ['TEAMID.com.sorowill.app'],
          components: [{ '/': '/will/*', comment: 'Open wills in the SoroWill mobile app' }],
        },
      ],
    },
  });
}
