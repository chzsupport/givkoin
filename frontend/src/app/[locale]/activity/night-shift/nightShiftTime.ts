export const NIGHT_SHIFT_START_HOUR = 19;
export const NIGHT_SHIFT_END_HOUR = 6;

export function formatNightShiftDuration(ms: number) {
    const safeMs = Math.max(0, Number.isFinite(ms) ? ms : 0);
    const seconds = Math.floor((safeMs / 1000) % 60);
    const minutes = Math.floor((safeMs / (1000 * 60)) % 60);
    const hours = Math.floor(safeMs / (1000 * 60 * 60));
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
