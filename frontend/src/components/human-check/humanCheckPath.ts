import { normalizeSitePath, pathStartsWith } from '@/utils/sitePath';

export function isHumanCheckExcludedPath(pathname: string) {
  const clean = normalizeSitePath(pathname || '/');
  return (
    pathStartsWith(clean, '/battle')
    || pathStartsWith(clean, '/activity/night-shift')
    || pathStartsWith(clean, '/evil-root')
  );
}
