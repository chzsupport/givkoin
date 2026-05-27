export async function fetchEntityAvatars() {
    const res = await fetch('/api/entity-avatars', { cache: 'no-store' });
    const data = await res.json().catch(() => ({ items: [] }));

    return Array.isArray(data?.items)
        ? (data.items as unknown[]).filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
}
