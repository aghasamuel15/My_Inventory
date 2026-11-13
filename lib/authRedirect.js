export function getPasswordResetRedirectUrl(fallbackOrigin) {
  const production = process.env.NODE_ENV === 'production';
  const isLocalhost = (hostname) => ['localhost', '127.0.0.1', '::1'].includes(hostname);
  let baseUrl = new URL(fallbackOrigin);
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    try {
      const configuredUrl = new URL(configuredSiteUrl);
      if (
        ['http:', 'https:'].includes(configuredUrl.protocol)
        && (!production || (configuredUrl.protocol === 'https:' && !isLocalhost(configuredUrl.hostname)))
      ) {
        baseUrl = configuredUrl;
      }
    } catch {
      // Fall back to the current app origin when the optional site URL is invalid.
    }
  }

  if (production && baseUrl.protocol !== 'https:' && !isLocalhost(baseUrl.hostname)) {
    baseUrl.protocol = 'https:';
  }

  return new URL('/auth/callback?next=%2Freset-password', baseUrl).toString();
}
