'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Bridge } from './types';
import { getBridgePairKey } from './bridgeUtils';

type BridgeCountryData = {
  distances: Record<string, number>;
  neighbors: Record<string, string[]>;
};

function parseBridgeCountryData(text: string): BridgeCountryData {
  const map: Record<string, Set<string>> = {};
  const distances: Record<string, number> = {};

  text.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const [pairPart, distancePart] = line.split('—').map((part) => part.trim());
    if (!pairPart) return;

    const [from, to] = pairPart.split('-').map((part) => part.trim());
    if (!from || !to) return;

    const fromSet = map[from] ?? new Set<string>();
    fromSet.add(to);
    map[from] = fromSet;

    if (!map[to]) map[to] = new Set<string>();

    const distanceKm = Number((distancePart || '').replace(/[^\d]/g, ''));
    if (Number.isFinite(distanceKm) && distanceKm > 0) {
      distances[getBridgePairKey(from, to)] = distanceKm;
    }
  });

  const neighbors: Record<string, string[]> = {};
  Object.entries(map).forEach(([country, countryNeighbors]) => {
    neighbors[country] = Array.from(countryNeighbors).sort();
  });

  return { distances, neighbors };
}

export function useBridgeCountryChoices({
  bridges,
  countryFrom,
  countryTo,
  onCountryToChange,
}: {
  bridges: Bridge[];
  countryFrom: string;
  countryTo: string;
  onCountryToChange: (value: string | ((previous: string) => string)) => void;
}) {
  const [neighborsMap, setNeighborsMap] = useState<Record<string, string[]>>({});
  const [bridgeDistanceMap, setBridgeDistanceMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadNeighbors = async () => {
      try {
        const response = await fetch(encodeURI('/country duration'));
        if (!response.ok) {
          console.error('Failed to load country duration file');
          return;
        }

        const data = parseBridgeCountryData(await response.text());
        setNeighborsMap(data.neighbors);
        setBridgeDistanceMap(data.distances);
      } catch (error) {
        console.error('Failed to parse country duration file', error);
      }
    };

    loadNeighbors();
  }, []);

  const availableToCountries = useMemo(() => {
    const neighbors = neighborsMap[countryFrom];
    if (!neighbors || neighbors.length === 0) {
      return [];
    }

    return neighbors.filter((neighbor) => {
      const hasBridge = bridges.some((bridge) =>
        (bridge.fromCountry === countryFrom && bridge.toCountry === neighbor) ||
        (bridge.fromCountry === neighbor && bridge.toCountry === countryFrom)
      );
      return !hasBridge;
    });
  }, [neighborsMap, countryFrom, bridges]);

  const selectedBridgeDistance = useMemo(
    () => bridgeDistanceMap[getBridgePairKey(countryFrom, countryTo)] || 0,
    [bridgeDistanceMap, countryFrom, countryTo],
  );

  useEffect(() => {
    if (!availableToCountries.length) {
      onCountryToChange(countryFrom);
      return;
    }

    onCountryToChange((previous) =>
      availableToCountries.includes(previous) ? previous : availableToCountries[0]
    );
  }, [availableToCountries, countryFrom, onCountryToChange]);

  return {
    availableToCountries,
    neighborsMap,
    selectedBridgeDistance,
  };
}
