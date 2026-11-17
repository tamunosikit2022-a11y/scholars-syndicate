import type { ReactNode } from 'react';

/** Small hand-drawn line icons, inlined so they cost no extra download. Decorative: hidden from screen readers. */
function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function CapIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M2 9l10-5 10 5-10 5L2 9z" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
      <path d="M22 9v6" />
    </Icon>
  );
}

export function SchoolIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M3 21h18" />
      <path d="M5 21V9l7-5 7 5v12" />
      <path d="M9.5 21v-5.5h5V21" />
      <path d="M12 9.5h.01" />
    </Icon>
  );
}

export function CalendarIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function BookIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M4 5a2 2 0 012-2h13v14H6a2 2 0 00-2 2V5z" />
      <path d="M4 19a2 2 0 012-2h13v4H6a2 2 0 01-2-2z" />
    </Icon>
  );
}

export function ClockIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function MailIcon({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3.5 7.5l8.5 6 8.5-6" />
    </Icon>
  );
}
