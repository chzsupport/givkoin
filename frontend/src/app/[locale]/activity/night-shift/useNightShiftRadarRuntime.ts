import { useCallback, useEffect, useRef, useState } from 'react';
import {
    getCurrentNightShiftAnomaly,
    type NightShiftLocalRuntime,
} from '@/utils/nightShiftRuntime';

export function useNightShiftRadarRuntime(
    isServing: boolean,
    runtime: NightShiftLocalRuntime | null,
) {
    const [radarTarget, setRadarTarget] = useState<string | null>(null);
    const [radarTargetId, setRadarTargetId] = useState<string | null>(null);
    const [radarTargetUrl, setRadarTargetUrl] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const lastAlertSectorRef = useRef<string | null>(null);
    const anomalyAudioBusyRef = useRef(false);

    const playAnomalyAlert = useCallback(async () => {
        if (anomalyAudioBusyRef.current) return;
        anomalyAudioBusyRef.current = true;

        try {
            const wait = (ms: number) => new Promise<void>((resolve) => {
                window.setTimeout(resolve, ms);
            });

            for (let i = 0; i < 3; i += 1) {
                const audio = new Audio('/anomaly.mp3');
                await audio.play().catch(() => { });
                await new Promise<void>((resolve) => {
                    const timeout = window.setTimeout(resolve, 1500);
                    audio.onended = () => {
                        window.clearTimeout(timeout);
                        resolve();
                    };
                });
                if (i < 2) {
                    await wait(1000);
                }
            }
        } finally {
            anomalyAudioBusyRef.current = false;
        }
    }, []);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isServing && runtime?.startTime) {
            const start = new Date(runtime.startTime).getTime();
            const syncFromRuntime = () => {
                setElapsedTime(Date.now() - start);
                const current = getCurrentNightShiftAnomaly(runtime, Date.now());
                if (current?.isActive && current.anomaly) {
                    setRadarTarget(current.anomaly.sectorName);
                    setRadarTargetId(current.anomaly.sectorId);
                    setRadarTargetUrl(current.anomaly.sectorUrl);
                } else {
                    setRadarTarget(null);
                    setRadarTargetId(null);
                    setRadarTargetUrl(null);
                }
            };

            syncFromRuntime();
            interval = setInterval(() => {
                syncFromRuntime();
            }, 1000);
        } else {
            setElapsedTime(0);
            setRadarTarget(null);
            setRadarTargetId(null);
            setRadarTargetUrl(null);
        }
        return () => clearInterval(interval);
    }, [isServing, runtime]);

    useEffect(() => {
        if (!isServing || !radarTargetId) {
            lastAlertSectorRef.current = null;
            return;
        }

        if (lastAlertSectorRef.current === radarTargetId) return;
        lastAlertSectorRef.current = radarTargetId;
        void playAnomalyAlert();
    }, [isServing, playAnomalyAlert, radarTargetId]);

    return {
        elapsedTime,
        radarTarget,
        radarTargetId,
        radarTargetUrl,
    };
}
