export function getPasswordResetRedirectUrl(fallbackOrigin) {
  return new URL('/auth/callback?next=%2Freset-password', fallbackOrigin).toString();
}
