export function createMeditationClientSessionId() {
    if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
