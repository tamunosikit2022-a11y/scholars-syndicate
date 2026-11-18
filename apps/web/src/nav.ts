import { useCallback, useEffect, useState } from 'react';

/** The two screens a signed-in person can move between with the bottom tab bar. */
export type Tab = 'home' | 'account';

/** "#account" opens the account screen; anything else (including nothing) is home. */
function tabFromHash(hash: string): Tab {
  return hash === '#account' ? 'account' : 'home';
}

/**
 * Which tab is open, kept in the address bar (#home, #account) so the phone's Back button, a refresh
 * and a shared link all land on the right screen without needing a router library.
 */
export function useTab(): Tab {
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash));
  const update = useCallback(() => setTab(tabFromHash(window.location.hash)), []);
  useEffect(() => {
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [update]);
  return tab;
}
