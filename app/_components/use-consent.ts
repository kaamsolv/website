'use client';

import { useSyncExternalStore } from 'react';
import { readConsent, subscribeConsent, type Consent } from '@/app/lib/analytics';

// The server (and the first client render) treat the choice as made, so a
// returning visitor never sees the banner flash; the real value arrives right
// after hydration.
const serverConsent = (): Consent => 'denied';

export function useConsent(): Consent {
  return useSyncExternalStore(subscribeConsent, readConsent, serverConsent);
}
