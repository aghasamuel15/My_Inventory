export function getPasswordResetRedirectUrl(fallbackOrigin) {
  const production = process.env.NODE_ENV === 'production';
  const isLocalhost = (hostname) => ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const baseUrl = new URL(fallbackOrigin);

  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('Password reset links require an HTTP or HTTPS app URL.');
  }

  if (production && baseUrl.protocol !== 'https:' && !isLocalhost(baseUrl.hostname)) {
    baseUrl.protocol = 'https:';
  }

  return new URL('/auth/callback/complete?next=%2Freset-password', baseUrl).toString();
}
