import { useCallback, useEffect, useRef, useState } from 'react';

export function useBattleDomeBlink() {
    const [domeBlinkAt, setDomeBlinkAt] = useState(0);
    const domeBlinkTimeoutRef = useRef<number | null>(null);

    const clearDomeBlink = useCallback(() => {
        if (domeBlinkTimeoutRef.current) {
            window.clearTimeout(domeBlinkTimeoutRef.current);
            domeBlinkTimeoutRef.current = null;
        }
        setDomeBlinkAt(0);
    }, []);

    const triggerDomeBlink = useCallback(() => {
        setDomeBlinkAt(Date.now());
        if (domeBlinkTimeoutRef.current) {
            window.clearTimeout(domeBlinkTimeoutRef.current);
        }
        domeBlinkTimeoutRef.current = window.setTimeout(() => {
            setDomeBlinkAt(0);
            domeBlinkTimeoutRef.current = null;
        }, 350);
    }, []);

    useEffect(() => clearDomeBlink, [clearDomeBlink]);

    return {
        clearDomeBlink,
        domeBlinkAt,
        triggerDomeBlink,
    };
}
