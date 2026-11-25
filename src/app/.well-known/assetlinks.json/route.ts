import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

/**
 * Serves the Android App Links association file with the
 * `application/json` content type required by Google.
 */
export function GET() {
  return NextResponse.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.sorowill.app',
        sha256_cert_fingerprints: ['REPLACE_WITH_RELEASE_CERT_SHA256'],
      },
    },
  ]);
}
