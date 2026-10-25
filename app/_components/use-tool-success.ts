'use client';

import { useEffect } from 'react';
import { trackToolSuccess, type ToolType } from '@/app/lib/analytics';

/**
 * For live tools that have no submit button: counts the first time the
 * tool has something to show, once per page. Pass a plain boolean such as
 * `text.trim() !== ''` — never the text itself.
 */
export function useToolSuccess(done: boolean, type?: ToolType): void {
  useEffect(() => {
    if (done) trackToolSuccess(type);
  }, [done, type]);
}
