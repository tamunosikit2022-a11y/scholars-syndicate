/**
 * Loads Google's "Sign in with Google" script on demand and describes the small part of it we use.
 * Docs: https://developers.google.com/identity/gsi/web/reference/js-reference
 */

export interface GoogleCredentialResponse {
  /** The signed ID token we send to our server for verification. */
  credential: string;
}

export interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let pending: Promise<GoogleIdApi> | null = null;

export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (pending) return pending;

  pending = new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else {
        pending = null;
        reject(new Error('Google sign-in script loaded but is not available'));
      }
    };
    script.onerror = () => {
      pending = null; // allow a later retry
      script.remove();
      reject(new Error('Could not load the Google sign-in script'));
    };
    document.head.appendChild(script);
  });
  return pending;
}
