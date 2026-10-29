/**
 * DRAFT Terms of Use and Privacy Policy, in plain language. This has NOT been reviewed by a lawyer.
 * Before launch: have it reviewed, publish it on its own pages (Google's app verification needs a public
 * privacy policy address) and bump CURRENT_TERMS_VERSION in packages/shared/src/onboarding.ts.
 */
export const LEGAL_DRAFT_NOTICE =
  'DRAFT — this text has not been reviewed by a lawyer yet and will change before launch.';

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export const LEGAL_SECTIONS: LegalSection[] = [
  {
    title: 'What we collect',
    paragraphs: [
      'From your Google account: your name, email address and profile photo.',
      'From you: a display name, your date of birth and your level (for example SS3 or JAMB candidate).',
      'As you use the app: your practice and exam activity, so we can show your progress.',
    ],
  },
  {
    title: 'How we use it',
    paragraphs: [
      'To run your account, personalise your practice and guidance, and keep the service safe.',
      'We do not sell your personal information.',
    ],
  },
  {
    title: 'Who can see it',
    paragraphs: [
      'Only your display name may appear on leaderboards. Your real name, email and date of birth stay private.',
      'Teachers, schools and universities will only see your details if you choose to share them.',
    ],
  },
  {
    title: 'If you are under 18',
    paragraphs: [
      'A parent or guardian must know about and allow your use of Scholars Syndicate. We record the time you confirm this.',
      'We will add ways for parents and guardians to be involved.',
    ],
  },
  {
    title: 'Your choices',
    paragraphs: [
      'You can change your display name and level at any time. We are adding ways to download or delete your data.',
      'Questions or problems: contact details will be added here before launch.',
    ],
  },
  {
    title: 'Cookies',
    paragraphs: ['We use one cookie to keep you signed in. We do not use advertising cookies.'],
  },
  {
    title: 'Rules of use',
    paragraphs: [
      'Be honest, respectful and safe. No cheating, harassment or misuse.',
      'We may suspend accounts that break these rules.',
    ],
  },
];
