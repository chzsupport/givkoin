export type FrozenTreePointCloud = {
  groundPositions: Float32Array;
  groundColors: Float32Array;
  trunkPositions: Float32Array;
  trunkColors: Float32Array;
  woodPositions: Float32Array;
  woodColors: Float32Array;
  foliagePositions: Float32Array;
  foliageColors: Float32Array;
};

type PackedLayerSection = {
  points: number;
  originalPoints: number;
  positions: {
    offsetBytes: number;
    length: number;
    componentType: 'uint16';
    min: [number, number, number];
    max: [number, number, number];
  };
  colorMode: 'single' | 'palette';
  singleColor: [number, number, number] | null;
  palette: [number, number, number][] | null;
  colors: {
    offsetBytes: number;
    length: number;
    componentType: 'uint8';
  } | null;
};

type PackedTreeMeta = {
  version: 2;
  format: 'packed-pointcloud-v2';
  sections: {
    ground: PackedLayerSection;
    trunk: PackedLayerSection;
    wood: PackedLayerSection;
    foliage: PackedLayerSection;
  };
};

const TREE_DATA_VERSION = '2026-03-24-7';
const META_URL = `/tree-data/yggdrasil-pointcloud.json?v=${TREE_DATA_VERSION}`;
const BIN_URL = `/tree-data/yggdrasil-pointcloud.bin?v=${TREE_DATA_VERSION}`;

let cachedTreePointCloud: FrozenTreePointCloud | null = null;
let cachedTreePointCloudPromise: Promise<FrozenTreePointCloud> | null = null;

function decodePositions(
  buffer: ArrayBuffer,
  section: PackedLayerSection,
): Float32Array {
  const decoded = new Float32Array(section.positions.length);
  const view = new DataView(
    buffer,
    section.positions.offsetBytes,
    section.positions.length * Uint16Array.BYTES_PER_ELEMENT,
  );

  const [minX, minY, minZ] = section.positions.min;
  const [maxX, maxY, maxZ] = section.positions.max;
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const rangeZ = maxZ - minZ;

  for (let i = 0; i < section.positions.length; i += 3) {
    const offset = i * Uint16Array.BYTES_PER_ELEMENT;
    const quantizedX = view.getUint16(offset, true);
    const quantizedY = view.getUint16(offset + Uint16Array.BYTES_PER_ELEMENT, true);
    const quantizedZ = view.getUint16(offset + Uint16Array.BYTES_PER_ELEMENT * 2, true);
    decoded[i] = minX + (quantizedX / 65535) * rangeX;
    decoded[i + 1] = minY + (quantizedY / 65535) * rangeY;
    decoded[i + 2] = minZ + (quantizedZ / 65535) * rangeZ;
  }

  return decoded;
}

function decodeColors(
  buffer: ArrayBuffer,
  section: PackedLayerSection,
): Float32Array {
  const decoded = new Float32Array(section.points * 3);

  if (section.colorMode === 'single' && section.singleColor) {
    const [red, green, blue] = section.singleColor;
    const normalizedRed = red / 255;
    const normalizedGreen = green / 255;
    const normalizedBlue = blue / 255;

    for (let i = 0; i < decoded.length; i += 3) {
      decoded[i] = normalizedRed;
      decoded[i + 1] = normalizedGreen;
      decoded[i + 2] = normalizedBlue;
    }

    return decoded;
  }

  if (!section.colors || !section.palette) {
    throw new Error('Packed tree layer is missing palette color data');
  }

  const paletteIndices = new Uint8Array(
    buffer,
    section.colors.offsetBytes,
    section.colors.length,
  );

  for (let pointIndex = 0; pointIndex < paletteIndices.length; pointIndex++) {
    const paletteEntry = section.palette[paletteIndices[pointIndex]] ?? section.palette[0];
    const targetIndex = pointIndex * 3;
    decoded[targetIndex] = paletteEntry[0] / 255;
    decoded[targetIndex + 1] = paletteEntry[1] / 255;
    decoded[targetIndex + 2] = paletteEntry[2] / 255;
  }

  return decoded;
}

export function getFrozenTreePointCloudCache() {
  return cachedTreePointCloud;
}

export async function loadFrozenTreePointCloud(): Promise<FrozenTreePointCloud> {
  if (cachedTreePointCloud) {
    return cachedTreePointCloud;
  }

  if (!cachedTreePointCloudPromise) {
    cachedTreePointCloudPromise = (async () => {
      const [metaResponse, binResponse] = await Promise.all([
        fetch(META_URL, { cache: 'force-cache' }),
        fetch(BIN_URL, { cache: 'force-cache' }),
      ]);

      if (!metaResponse.ok) {
        throw new Error(`Failed to load tree metadata: ${metaResponse.status}`);
      }

      if (!binResponse.ok) {
        throw new Error(`Failed to load frozen tree data: ${binResponse.status}`);
      }

      const metadata = (await metaResponse.json()) as PackedTreeMeta;
      const buffer = await binResponse.arrayBuffer();

      const nextTreePointCloud: FrozenTreePointCloud = {
        groundPositions: decodePositions(buffer, metadata.sections.ground),
        groundColors: decodeColors(buffer, metadata.sections.ground),
        trunkPositions: decodePositions(buffer, metadata.sections.trunk),
        trunkColors: decodeColors(buffer, metadata.sections.trunk),
        woodPositions: decodePositions(buffer, metadata.sections.wood),
        woodColors: decodeColors(buffer, metadata.sections.wood),
        foliagePositions: decodePositions(buffer, metadata.sections.foliage),
        foliageColors: decodeColors(buffer, metadata.sections.foliage),
      };

      cachedTreePointCloud = nextTreePointCloud;
      return nextTreePointCloud;
    })();
  }

  return cachedTreePointCloudPromise;
}

export function preloadFrozenTreePointCloud() {
  void loadFrozenTreePointCloud();
}
