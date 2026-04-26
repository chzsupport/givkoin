/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const META_PATH = path.join(ROOT, 'src/lib/tree/source-data/yggdrasil-pointcloud-source.json');
const BIN_PATH = path.join(ROOT, 'src/lib/tree/source-data/yggdrasil-pointcloud-source.bin');

const OUTPUT_META_PATH = path.join(ROOT, 'public/tree-data/yggdrasil-pointcloud.json');
const OUTPUT_BIN_PATH = path.join(ROOT, 'public/tree-data/yggdrasil-pointcloud.bin');

const FLOAT_KEYS = [
  'groundPositions',
  'groundColors',
  'trunkPositions',
  'trunkColors',
  'woodPositions',
  'woodColors',
  'foliagePositions',
  'foliageColors',
];

const LAYERS = [
  {
    name: 'ground',
    positionKey: 'groundPositions',
    colorKey: 'groundColors',
    dedupeCell: 0.28,
    singleColor: null,
    palette: [
      [44, 30, 22],
      [56, 38, 28],
      [68, 47, 35],
      [82, 58, 43],
    ],
  },
  {
    name: 'trunk',
    positionKey: 'trunkPositions',
    colorKey: 'trunkColors',
    dedupeCell: 0.55,
    singleColor: [68, 48, 35],
    palette: null,
  },
  {
    name: 'wood',
    positionKey: 'woodPositions',
    colorKey: 'woodColors',
    dedupeCell: 0.36,
    singleColor: null,
    palette: [
      [65, 46, 33],
      [88, 64, 46],
      [112, 81, 60],
      [148, 118, 92],
      [226, 180, 139],
    ],
  },
  {
    name: 'foliage',
    positionKey: 'foliagePositions',
    colorKey: 'foliageColors',
    dedupeCell: 0.28,
    singleColor: null,
    palette: [
      [152, 112, 82],
      [176, 132, 99],
      [201, 154, 117],
      [226, 180, 139],
    ],
  },
];

function loadOldPointCloud() {
  const metadata = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  const buffer = fs.readFileSync(BIN_PATH);
  const floats = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
  const result = {};

  for (const key of FLOAT_KEYS) {
    const meta = metadata.arrays[key];
    result[key] = floats.slice(meta.offset, meta.offset + meta.length);
  }

  return result;
}

function nearestPaletteIndex(rgb, palette) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const dr = rgb[0] - pr;
    const dg = rgb[1] - pg;
    const db = rgb[2] - pb;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function quantizeCoordinate(value, min, max) {
  if (max <= min) {
    return 0;
  }
  return Math.max(0, Math.min(65535, Math.round(((value - min) / (max - min)) * 65535)));
}

function percentile(values, ratio) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function circularSmooth(values, radius) {
  return values.map((value, index) => {
    if (!Number.isFinite(value)) {
      return value;
    }

    let sum = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      const nextIndex = (index + offset + values.length) % values.length;
      const nextValue = values[nextIndex];
      if (Number.isFinite(nextValue)) {
        sum += nextValue;
        count += 1;
      }
    }

    return count ? sum / count : value;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleToBin(angle, count) {
  let binIndex = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * count);
  if (binIndex < 0) binIndex = 0;
  if (binIndex >= count) binIndex = count - 1;
  return binIndex;
}

function pushBestCandidate(groups, key, candidate, limit, comparator) {
  const list = groups.get(key) ?? [];
  list.push(candidate);
  list.sort(comparator);
  if (list.length > limit) {
    list.length = limit;
  }
  groups.set(key, list);
}

function buildGroundShell(positions, colors) {
  const TOP_MIN_Y = -26;
  const SIDE_MIN_Y = -140;
  const SIDE_MAX_Y = -18;
  const RIM_MIN_Y = -48;
  const RIM_MAX_Y = -18;
  const TOP_ANGLE_BINS = 480;
  const TOP_RADIAL_STEP = 2.35;
  const SIDE_ANGLE_BINS = 560;
  const SIDE_HEIGHT_STEP = 2.35;
  const RIM_ANGLE_BINS = 600;
  const RIM_HEIGHT_STEP = 2.1;
  const TOP_SHELL_DEPTH = 5;
  const SIDE_SHELL_DEPTH = 3;
  const RIM_SHELL_DEPTH = 5;

  const topGroups = new Map();
  const sideGroups = new Map();
  const rimGroups = new Map();
  const keptPointIndices = new Set();

  for (let pointIndex = 0, i = 0; i < positions.length; i += 3, pointIndex += 1) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const radius = Math.sqrt(x * x + z * z);

    if (y < SIDE_MIN_Y || y > -4) {
      continue;
    }

    const angleBin = angleToBin(Math.atan2(z, x), y > TOP_MIN_Y ? TOP_ANGLE_BINS : SIDE_ANGLE_BINS);

    if (y > TOP_MIN_Y) {
      const radialBin = Math.max(0, Math.floor(radius / TOP_RADIAL_STEP));
      const key = `${angleBin}|${radialBin}`;
      pushBestCandidate(
        topGroups,
        key,
        { pointIndex, primary: y, secondary: radius },
        TOP_SHELL_DEPTH,
        (left, right) => (right.primary - left.primary) || (right.secondary - left.secondary),
      );
      continue;
    }

    if (y >= RIM_MIN_Y && y <= RIM_MAX_Y) {
      const rimAngleBin = angleToBin(Math.atan2(z, x), RIM_ANGLE_BINS);
      const rimHeightBin = Math.max(0, Math.floor((y - RIM_MIN_Y) / RIM_HEIGHT_STEP));
      const key = `${rimAngleBin}|${rimHeightBin}`;
      pushBestCandidate(
        rimGroups,
        key,
        { pointIndex, primary: radius, secondary: y },
        RIM_SHELL_DEPTH,
        (left, right) => (right.primary - left.primary) || (right.secondary - left.secondary),
      );
    }

    if (y > SIDE_MAX_Y) {
      continue;
    }

    const heightBin = Math.max(0, Math.floor((y - SIDE_MIN_Y) / SIDE_HEIGHT_STEP));
    const key = `${angleBin}|${heightBin}`;
      pushBestCandidate(
        sideGroups,
        key,
        { pointIndex, primary: radius, secondary: y },
        SIDE_SHELL_DEPTH,
        (left, right) => (right.primary - left.primary) || (right.secondary - left.secondary),
      );
    }

  for (const group of topGroups.values()) {
    group.forEach((candidate) => keptPointIndices.add(candidate.pointIndex));
  }

    for (const group of sideGroups.values()) {
      group.forEach((candidate) => keptPointIndices.add(candidate.pointIndex));
    }

    for (const group of rimGroups.values()) {
      group.forEach((candidate) => keptPointIndices.add(candidate.pointIndex));
    }

  const sortedPointIndices = [...keptPointIndices].sort((left, right) => left - right);
  const keptPositions = new Float32Array(sortedPointIndices.length * 3);
  const keptColors = colors ? new Float32Array(sortedPointIndices.length * 3) : null;

  sortedPointIndices.forEach((pointIndex, nextIndex) => {
    const sourceOffset = pointIndex * 3;
    const targetOffset = nextIndex * 3;
    keptPositions[targetOffset] = positions[sourceOffset];
    keptPositions[targetOffset + 1] = positions[sourceOffset + 1];
    keptPositions[targetOffset + 2] = positions[sourceOffset + 2];

    if (keptColors) {
      keptColors[targetOffset] = colors[sourceOffset];
      keptColors[targetOffset + 1] = colors[sourceOffset + 1];
      keptColors[targetOffset + 2] = colors[sourceOffset + 2];
    }
  });

  return {
    positions: keptPositions,
    colors: keptColors,
  };
}

function reshapeGroundSeam(positions, colors) {
  const shell = buildGroundShell(positions, colors);
  const nextPositions = new Float32Array(shell.positions);
  const nextColors = shell.colors ? new Float32Array(shell.colors) : null;
  const BIN_COUNT = 40;
  const bins = Array.from({ length: BIN_COUNT }, () => ({
    radii: [],
    upperHeights: [],
    lowerHeights: [],
  }));

  for (let i = 0; i < nextPositions.length; i += 3) {
    const x = nextPositions[i];
    const y = nextPositions[i + 1];
    const z = nextPositions[i + 2];
    const radius = Math.sqrt(x * x + z * z);

    if (radius < 100 || y > -10 || y < -150) {
      continue;
    }

    let binIndex = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * BIN_COUNT);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= BIN_COUNT) binIndex = BIN_COUNT - 1;

    bins[binIndex].radii.push(radius);
    if (y > -60) {
      bins[binIndex].upperHeights.push(y);
    } else {
      bins[binIndex].lowerHeights.push(y);
    }
  }

  const rawOuter = bins.map((bin) => percentile(bin.radii, 0.97));
  const rawUpper = bins.map((bin) => percentile(bin.upperHeights, 0.75));
  const rawLower = bins.map((bin) => percentile(bin.lowerHeights, 0.3));
  const smoothOuter = circularSmooth(rawOuter, 2);
  const smoothUpper = circularSmooth(rawUpper, 2);
  const smoothLower = circularSmooth(rawLower, 2);

  const seamWeights = {
    39: 1,
    0: 1,
    38: 0.75,
    1: 0.75,
    37: 0.4,
    2: 0.4,
  };

  for (let i = 0; i < nextPositions.length; i += 3) {
    const x = nextPositions[i];
    const y = nextPositions[i + 1];
    const z = nextPositions[i + 2];
    const radius = Math.sqrt(x * x + z * z);
    if (radius < 100 || y > -10 || y < -150) {
      continue;
    }

    let binIndex = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * BIN_COUNT);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= BIN_COUNT) binIndex = BIN_COUNT - 1;

    const seamWeight = seamWeights[binIndex] ?? 0;
    if (seamWeight <= 0) {
      continue;
    }

    const targetOuter = smoothOuter[binIndex] ?? rawOuter[binIndex] ?? radius;
    const outerWeight = Math.max(0, Math.min(1, (radius - (targetOuter - 32)) / 32));
    const weight = seamWeight * outerWeight;
    if (weight <= 0) {
      continue;
    }

    const targetUpper = smoothUpper[binIndex] ?? -24;
    const targetLower = smoothLower[binIndex] ?? -70;
    const targetHeight = y > -60 ? targetUpper : targetLower;
    nextPositions[i + 1] = y + (targetHeight - y) * weight * 0.92;

    if (radius < targetOuter) {
      const nextRadius = radius + (targetOuter - radius) * weight * 0.88;
      const scale = radius > 0 ? nextRadius / radius : 1;
      nextPositions[i] *= scale;
      nextPositions[i + 2] *= scale;
    }
  }

  const artifactWeights = {
    38: 0.45,
    39: 1,
  };

  for (let i = 0; i < nextPositions.length; i += 3) {
    const x = nextPositions[i];
    const y = nextPositions[i + 1];
    const z = nextPositions[i + 2];
    const radius = Math.sqrt(x * x + z * z);

    if (radius < 100 || y > -35 || y < -110) {
      continue;
    }

    let binIndex = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * BIN_COUNT);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= BIN_COUNT) binIndex = BIN_COUNT - 1;

    const artifactWeight = artifactWeights[binIndex] ?? 0;
    if (artifactWeight <= 0) {
      continue;
    }

    const targetOuter = smoothOuter[binIndex] ?? rawOuter[binIndex] ?? radius;
    const targetLower = smoothLower[binIndex] ?? -72;
    const lowerOutlier = y < targetLower - 6;
    const outerOutlier = radius > targetOuter + 1;

    if (!lowerOutlier && !outerOutlier) {
      continue;
    }

    if (lowerOutlier) {
      nextPositions[i + 1] = y + (targetLower - y) * artifactWeight * 0.95;
    }

    if (outerOutlier) {
      const nextRadius = radius + (targetOuter - radius) * artifactWeight * 0.72;
      const scale = radius > 0 ? nextRadius / radius : 1;
      nextPositions[i] *= scale;
      nextPositions[i + 2] *= scale;
    }
  }

  const DETAIL_BIN_COUNT = 100;
  const detailBins = Array.from({ length: DETAIL_BIN_COUNT }, () => ({
    radii: [],
    upperHeights: [],
    lowerHeights: [],
    lowerRadii: [],
  }));

  for (let i = 0; i < nextPositions.length; i += 3) {
    const x = nextPositions[i];
    const y = nextPositions[i + 1];
    const z = nextPositions[i + 2];
    const radius = Math.sqrt(x * x + z * z);

    if (radius < 80 || y > -10 || y < -150) {
      continue;
    }

    let binIndex = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * DETAIL_BIN_COUNT);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= DETAIL_BIN_COUNT) binIndex = DETAIL_BIN_COUNT - 1;

    detailBins[binIndex].radii.push(radius);
    if (y > -60) {
      detailBins[binIndex].upperHeights.push(y);
    } else {
      detailBins[binIndex].lowerHeights.push(y);
      detailBins[binIndex].lowerRadii.push(radius);
    }
  }

  const detailOuter = circularSmooth(detailBins.map((bin) => percentile(bin.radii, 0.97)), 3);
  const detailUpper = circularSmooth(detailBins.map((bin) => percentile(bin.upperHeights, 0.7)), 3);
  const detailLower = circularSmooth(detailBins.map((bin) => percentile(bin.lowerHeights, 0.3)), 3);
  const detailLowerRadius = circularSmooth(detailBins.map((bin) => percentile(bin.lowerRadii, 0.65)), 3);
  const bulgeWeights = {
    96: 0.35,
    97: 1,
    98: 1,
    99: 0.45,
  };

  for (let i = 0; i < nextPositions.length; i += 3) {
    const x = nextPositions[i];
    const y = nextPositions[i + 1];
    const z = nextPositions[i + 2];
    const radius = Math.sqrt(x * x + z * z);

    if (radius < 100 || y > -20 || y < -95) {
      continue;
    }

    let binIndex = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * DETAIL_BIN_COUNT);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= DETAIL_BIN_COUNT) binIndex = DETAIL_BIN_COUNT - 1;

    const bulgeWeight = bulgeWeights[binIndex] ?? 0;
    if (bulgeWeight <= 0) {
      continue;
    }

    const topY = detailUpper[binIndex] ?? -24;
    const bottomY = detailLower[binIndex] ?? -86;
    if (y >= topY || y <= bottomY) {
      continue;
    }

    const outerRadius = detailOuter[binIndex] ?? radius;
    const lowerRadius = detailLowerRadius[binIndex] ?? Math.max(outerRadius - 55, 80);
    const progress = clamp((y - topY) / (bottomY - topY), 0, 1);
    const expectedRadius = outerRadius + (lowerRadius - outerRadius) * progress;
    const radiusDelta = radius - expectedRadius;

    if (radiusDelta <= 4) {
      continue;
    }

    const targetRadius = expectedRadius + 1.5;
    const nextRadius = radius + (targetRadius - radius) * bulgeWeight * 0.92;
    const scale = radius > 0 ? nextRadius / radius : 1;
    nextPositions[i] *= scale;
    nextPositions[i + 2] *= scale;
  }

  const midslopeWeights = {
    97: 0.85,
    98: 1,
    99: 0.9,
  };

  for (let i = 0; i < nextPositions.length; i += 3) {
    const x = nextPositions[i];
    const y = nextPositions[i + 1];
    const z = nextPositions[i + 2];
    const radius = Math.sqrt(x * x + z * z);

    if (radius < 100 || y > -40 || y < -92) {
      continue;
    }

    let binIndex = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * DETAIL_BIN_COUNT);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= DETAIL_BIN_COUNT) binIndex = DETAIL_BIN_COUNT - 1;

    const midslopeWeight = midslopeWeights[binIndex] ?? 0;
    if (midslopeWeight <= 0) {
      continue;
    }

    const topY = detailUpper[binIndex] ?? -24;
    const bottomY = detailLower[binIndex] ?? -86;
    const outerRadius = detailOuter[binIndex] ?? radius;
    const lowerRadius = detailLowerRadius[binIndex] ?? Math.max(outerRadius - 55, 80);
    const upperLimit = Math.min(-40, topY - 10);
    const lowerLimit = Math.max(-92, bottomY + 2);

    if (y > upperLimit || y < lowerLimit) {
      continue;
    }

    const progress = clamp((y - topY) / (bottomY - topY), 0, 1);
    const expectedRadius = outerRadius + (lowerRadius - outerRadius) * progress;
    const radiusDelta = radius - expectedRadius;

    if (radiusDelta <= 1.25) {
      continue;
    }

    const targetRadius = expectedRadius + 0.35;
    const nextRadius = radius + (targetRadius - radius) * midslopeWeight * 0.96;
    const scale = radius > 0 ? nextRadius / radius : 1;
    nextPositions[i] *= scale;
    nextPositions[i + 2] *= scale;
  }

  const lowerLipWeights = {
    97: 0.7,
    98: 1,
    99: 1,
  };

  for (let i = 0; i < nextPositions.length; i += 3) {
    const x = nextPositions[i];
    const y = nextPositions[i + 1];
    const z = nextPositions[i + 2];
    const radius = Math.sqrt(x * x + z * z);

    if (radius < 100 || y > -78 || y < -96) {
      continue;
    }

    let binIndex = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * DETAIL_BIN_COUNT);
    if (binIndex < 0) binIndex = 0;
    if (binIndex >= DETAIL_BIN_COUNT) binIndex = DETAIL_BIN_COUNT - 1;

    const lowerLipWeight = lowerLipWeights[binIndex] ?? 0;
    if (lowerLipWeight <= 0) {
      continue;
    }

    const bottomY = detailLower[binIndex] ?? -86;
    const lowerRadius = detailLowerRadius[binIndex] ?? 121;
    const lipUpper = bottomY + 6;
    const lipLower = bottomY - 4;

    if (y > lipUpper || y < lipLower) {
      continue;
    }

    const radiusDelta = radius - lowerRadius;
    if (radiusDelta <= 0.9) {
      continue;
    }

    const targetRadius = lowerRadius + 0.15;
    const nextRadius = radius + (targetRadius - radius) * lowerLipWeight * 0.97;
    const scale = radius > 0 ? nextRadius / radius : 1;
    nextPositions[i] *= scale;
    nextPositions[i + 2] *= scale;

    if (y < bottomY - 0.35) {
      nextPositions[i + 1] = y + ((bottomY - 0.35) - y) * lowerLipWeight * 0.92;
    }
  }

  return {
    positions: nextPositions,
    colors: nextColors,
  };
}

function dedupeLayer(layerConfig, positions, colors) {
  const preparedLayer = layerConfig.name === 'ground'
    ? reshapeGroundSeam(positions, colors)
    : { positions, colors };
  const keptPositions = [];
  const keptColorRefs = [];
  const seen = new Set();

  for (let i = 0; i < preparedLayer.positions.length; i += 3) {
    const x = preparedLayer.positions[i];
    const y = preparedLayer.positions[i + 1];
    const z = preparedLayer.positions[i + 2];
    const cellX = Math.round(x / layerConfig.dedupeCell);
    const cellY = Math.round(y / layerConfig.dedupeCell);
    const cellZ = Math.round(z / layerConfig.dedupeCell);
    const key = `${cellX}|${cellY}|${cellZ}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    keptPositions.push(x, y, z);

    if (preparedLayer.colors) {
      keptColorRefs.push(
        preparedLayer.colors[i],
        preparedLayer.colors[i + 1],
        preparedLayer.colors[i + 2],
      );
    }
  }

  return {
    positions: new Float32Array(keptPositions),
    colors: colors ? new Float32Array(keptColorRefs) : null,
  };
}

function packLayer(layerConfig, positions, colors) {
  const deduped = dedupeLayer(layerConfig, positions, colors);
  const dedupedPositions = deduped.positions;
  const dedupedColors = deduped.colors;
  const points = dedupedPositions.length / 3;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < dedupedPositions.length; i += 3) {
    const x = dedupedPositions[i];
    const y = dedupedPositions[i + 1];
    const z = dedupedPositions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const quantizedPositions = new Uint16Array(dedupedPositions.length);
  for (let i = 0; i < dedupedPositions.length; i += 3) {
    quantizedPositions[i] = quantizeCoordinate(dedupedPositions[i], minX, maxX);
    quantizedPositions[i + 1] = quantizeCoordinate(dedupedPositions[i + 1], minY, maxY);
    quantizedPositions[i + 2] = quantizeCoordinate(dedupedPositions[i + 2], minZ, maxZ);
  }

  let colorIndices = null;
    if (!layerConfig.singleColor && layerConfig.palette && dedupedColors) {
      colorIndices = new Uint8Array(points);
      for (let pointIndex = 0; pointIndex < points; pointIndex++) {
        const base = pointIndex * 3;
        const rgb = [
        Math.round(dedupedColors[base] * 255),
          Math.round(dedupedColors[base + 1] * 255),
          Math.round(dedupedColors[base + 2] * 255),
        ];
        let paletteIndex = nearestPaletteIndex(rgb, layerConfig.palette);

        if (layerConfig.name === 'wood') {
          const pointY = dedupedPositions[base + 1];
          const vineCandidate = pointY >= 80 && rgb[0] >= 140 && rgb[1] >= 96 && rgb[2] <= 32;

          if (vineCandidate) {
            paletteIndex = layerConfig.palette.length - 1;
          } else if (pointY < 60) {
            paletteIndex = clamp(paletteIndex, 1, 2);
          } else {
            paletteIndex = Math.min(paletteIndex, 1);
          }
        }

        colorIndices[pointIndex] = paletteIndex;
      }
    }

  return {
    name: layerConfig.name,
    points,
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    positions: quantizedPositions,
    colors: colorIndices,
    singleColor: layerConfig.singleColor,
    palette: layerConfig.palette,
    originalPoints: positions.length / 3,
  };
}

function main() {
  const pointCloud = loadOldPointCloud();
  const packedLayers = LAYERS.map((layer) =>
    packLayer(layer, pointCloud[layer.positionKey], pointCloud[layer.colorKey]),
  );

  let byteOffset = 0;
  const sections = {};
  const buffers = [];

  for (const layer of packedLayers) {
    if (byteOffset % 2 !== 0) {
      buffers.push(Buffer.from([0]));
      byteOffset += 1;
    }

    const positionBuffer = Buffer.from(layer.positions.buffer);
    buffers.push(positionBuffer);

    const section = {
      points: layer.points,
      originalPoints: layer.originalPoints,
      positions: {
        offsetBytes: byteOffset,
        length: layer.positions.length,
        componentType: 'uint16',
        min: layer.min,
        max: layer.max,
      },
      colorMode: layer.singleColor ? 'single' : 'palette',
      singleColor: layer.singleColor,
      palette: layer.palette,
      colors: null,
    };

    byteOffset += positionBuffer.byteLength;

    if (layer.colors) {
      const colorBuffer = Buffer.from(layer.colors.buffer);
      buffers.push(colorBuffer);
      section.colors = {
        offsetBytes: byteOffset,
        length: layer.colors.length,
        componentType: 'uint8',
      };
      byteOffset += colorBuffer.byteLength;
    }

    sections[layer.name] = section;
  }

  const metadata = {
    version: 2,
    format: 'packed-pointcloud-v2',
    sections,
  };

  const finalBuffer = Buffer.concat(buffers);
  fs.writeFileSync(OUTPUT_BIN_PATH, finalBuffer);
  fs.writeFileSync(OUTPUT_META_PATH, JSON.stringify(metadata, null, 2));

  const totalOriginalPoints = packedLayers.reduce((sum, layer) => sum + layer.originalPoints, 0);
  const totalPackedPoints = packedLayers.reduce((sum, layer) => sum + layer.points, 0);

  console.log(JSON.stringify({
    totalOriginalPoints,
    totalPackedPoints,
    removedPoints: totalOriginalPoints - totalPackedPoints,
    removedPercent: Number((((totalOriginalPoints - totalPackedPoints) / totalOriginalPoints) * 100).toFixed(2)),
    outputBytes: finalBuffer.byteLength,
    outputMB: Number((finalBuffer.byteLength / (1024 * 1024)).toFixed(2)),
    byLayer: packedLayers.map((layer) => ({
      name: layer.name,
      originalPoints: layer.originalPoints,
      packedPoints: layer.points,
    })),
  }, null, 2));
}

main();
