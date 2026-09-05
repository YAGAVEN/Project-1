/**
 * Supabase Auth returns technical strings ("Invalid login credentials", "User
 * already registered", …). Map the common ones to plain language so the auth
 * pages speak the user's vocabulary — anything unknown passes through as-is.
 */
export function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return 'That email and password don’t match. Try again, or reset your password.'
  }
  if (/email not confirmed/i.test(message)) {
    return 'Please confirm your email first — check your inbox for the confirmation link.'
  }
  if (/already registered/i.test(message)) {
    return 'An account with this email already exists. Try logging in instead.'
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Too many attempts. Wait a minute and try again.'
  }
  return message
}
