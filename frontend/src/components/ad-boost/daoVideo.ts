import { DAO_PREROLL_SCRIPT_SRC } from './constants';
import type { DaoVideoConstructor, DaoVideoInstance } from './types';

declare global {
  interface Window {
    DaoVideo?: DaoVideoConstructor;
    daoVideoPreRoll?: DaoVideoInstance;
  }
}

let daoVideoScriptPromise: Promise<void> | null = null;

export function readDaoVideoConstructor() {
  if (typeof window === 'undefined') return undefined;
  if (window.DaoVideo) return window.DaoVideo;

  try {
    const candidate = Function('return typeof DaoVideo !== "undefined" ? DaoVideo : undefined;')() as DaoVideoConstructor | undefined;
    if (candidate) {
      window.DaoVideo = candidate;
      return candidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function loadDaoVideoScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('dao_browser_unavailable'));
  }
  if (readDaoVideoConstructor()) {
    return Promise.resolve();
  }
  if (daoVideoScriptPromise) {
    return daoVideoScriptPromise;
  }

  daoVideoScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DAO_PREROLL_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => {
        if (readDaoVideoConstructor()) {
          resolve();
        } else {
          reject(new Error('dao_player_missing'));
        }
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('dao_load_failed')), { once: true });
      if (readDaoVideoConstructor()) resolve();
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = DAO_PREROLL_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (readDaoVideoConstructor()) {
        resolve();
      } else {
        reject(new Error('dao_player_missing'));
      }
    };
    script.onerror = () => reject(new Error('dao_load_failed'));
    document.body.appendChild(script);
  });

  return daoVideoScriptPromise;
}
