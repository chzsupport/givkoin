export function formatCollectiveMeditationTime(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}
