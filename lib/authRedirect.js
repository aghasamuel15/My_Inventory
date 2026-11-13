export function getPasswordResetRedirectUrl(fallbackOrigin) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const baseUrl = siteUrl || fallbackOrigin;

  return new URL('/auth/callback?next=%2Freset-password', baseUrl).toString();
}
