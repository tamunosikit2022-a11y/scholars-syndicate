/** Plain-language messages for everything that can go wrong while signing in. */
const MESSAGES: Record<string, string> = {
  invalid_google_token: 'Google could not confirm your sign-in. Please try again.',
  email_not_verified:
    'Your Google email address is not verified yet. Verify it with Google, then try again.',
  account_suspended: 'This account has been suspended. Please contact support.',
  email_already_registered:
    'This email address is already linked to a different account. Please contact support.',
  google_sign_in_not_configured: 'Sign-in is not switched on yet. Please check back soon.',
  google_unreachable: 'We could not reach Google. Check your internet connection and try again.',
  too_many_requests: 'Too many attempts. Please wait a few minutes and try again.',
  forbidden_origin:
    'This website address is not allowed to sign in. Please open the site from its official address.',
  invalid_request: 'Something went wrong with the sign-in. Please try again.',
  network: 'We could not reach the server. Check your internet connection and try again.',
};

export function messageForError(code: string): string {
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}
