import { HomeIcon, UserIcon } from './icons';
import type { Tab } from './nav';

/** The bottom tab bar: thumb-friendly navigation between Home and Account. */
export function TabBar({ tab }: { tab: Tab }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <ul>
        <li>
          <a href="#home" className="tab" aria-current={tab === 'home' ? 'page' : undefined}>
            <HomeIcon />
            <span>Home</span>
          </a>
        </li>
        <li>
          <a href="#account" className="tab" aria-current={tab === 'account' ? 'page' : undefined}>
            <UserIcon />
            <span>Account</span>
          </a>
        </li>
      </ul>
    </nav>
  );
}
