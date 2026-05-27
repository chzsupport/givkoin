export type CollectiveMeditationPhase = 'give' | 'absorb';

export interface MeditationPlanetSceneProps {
    phase: CollectiveMeditationPhase;
    beamActive: boolean;
    beamOriginScreenY?: number | null;
}
