import { useEffect, useRef, useState } from 'react';

type LeafPoint = {
  id: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  color: string;
  opacity: number;
};

type DragState = {
  index: number;
  pointerId: number;
} | null;

type RawLeafPoint = {
  x: number;
  y: number;
  z: number;
};

const COORDINATE_PATH = '/tree-data/coordinate.txt';
const TREE_IMAGE_URL = new URL('../6.png', import.meta.url).href;
const VIEWBOX_SIZE = 100;
const HIT_RADIUS = 1.1;
const LEAF_ZONE = {
  left: 5,
  top: 0.5,
  width: 90,
  height: 45,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseLeafPoints(text: string) {
  const rawPoints: RawLeafPoint[] = [];
  const re = /\[leaf-point\]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    rawPoints.push({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    });
  }

  if (!rawPoints.length) {
    throw new Error('Не удалось прочитать точки листвы');
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const point of rawPoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;

  return rawPoints.map((point, index) => {
    const normalizedX = (point.x - minX) / rangeX;
    const normalizedY = 1 - (point.y - minY) / rangeY;
    const depth = (point.z - minZ) / rangeZ;

    const x = LEAF_ZONE.left + normalizedX * LEAF_ZONE.width;
    const y = LEAF_ZONE.top + normalizedY * LEAF_ZONE.height;
    const size = 0.07 + depth * 0.12 + (index % 5 === 0 ? 0.02 : 0);
    const hue = 86 + depth * 42 + (index % 11) * 1.3;
    const light = 52 + depth * 18;

    return {
      id: index,
      x,
      y,
      baseX: x,
      baseY: y,
      size,
      color: `hsl(${hue.toFixed(1)} 92% ${light.toFixed(1)}%)`,
      opacity: 0.52 + depth * 0.34,
    };
  });
}

function getPointerPosition(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * VIEWBOX_SIZE;
  const y = ((clientY - rect.top) / rect.height) * VIEWBOX_SIZE;

  return {
    x: clamp(x, 0, VIEWBOX_SIZE),
    y: clamp(y, 0, VIEWBOX_SIZE),
  };
}

function findNearestPointIndex(points: LeafPoint[], x: number, y: number) {
  let bestIndex = -1;
  let bestDistance = HIT_RADIUS * HIT_RADIUS;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const dx = point.x - x;
    const dy = point.y - y;
    const distance = dx * dx + dy * dy;

    if (distance > bestDistance) {
      continue;
    }

    bestDistance = distance;
    bestIndex = index;
  }

  return bestIndex;
}

export default function TreeScene() {
  const [points, setPoints] = useState<LeafPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const circleRefs = useRef<Array<SVGCircleElement | null>>([]);
  const pointsRef = useRef<LeafPoint[]>([]);
  const initialPointsRef = useRef<LeafPoint[]>([]);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setErrorText(null);

        const response = await fetch(COORDINATE_PATH);
        if (!response.ok) {
          throw new Error(`Файл точек не найден: ${response.status}`);
        }

        const text = await response.text();
        const nextPoints = parseLeafPoints(text);

        if (isCancelled) {
          return;
        }

        const clonedPoints = nextPoints.map((point) => ({ ...point }));
        pointsRef.current = clonedPoints.map((point) => ({ ...point }));
        initialPointsRef.current = clonedPoints.map((point) => ({ ...point }));
        setPoints(clonedPoints);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : 'Не удалось загрузить листву';
        setErrorText(message);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, []);

  const movePoint = (index: number, x: number, y: number) => {
    const currentPoint = pointsRef.current[index];
    if (!currentPoint) {
      return;
    }

    const nextPoint = {
      ...currentPoint,
      x: clamp(x, 0, VIEWBOX_SIZE),
      y: clamp(y, 0, VIEWBOX_SIZE),
    };

    pointsRef.current[index] = nextPoint;

    const circle = circleRefs.current[index];
    if (circle) {
      circle.setAttribute('cx', nextPoint.x.toFixed(3));
      circle.setAttribute('cy', nextPoint.y.toFixed(3));
    }
  };

  const finishDrag = (pointerId?: number) => {
    const svg = svgRef.current;
    if (svg && pointerId !== undefined && svg.hasPointerCapture(pointerId)) {
      svg.releasePointerCapture(pointerId);
    }

    setPoints(pointsRef.current.slice());
    setDragState(null);
  };

  const resetPoints = () => {
    const resetList = initialPointsRef.current.map((point) => ({ ...point }));
    pointsRef.current = resetList.map((point) => ({ ...point }));
    setPoints(resetList);
    setDragState(null);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || isLoading) {
      return;
    }

    const svg = svgRef.current;
    if (!svg || !pointsRef.current.length) {
      return;
    }

    const pointer = getPointerPosition(svg, event.clientX, event.clientY);
    const nearestPointIndex = findNearestPointIndex(pointsRef.current, pointer.x, pointer.y);

    if (nearestPointIndex < 0) {
      return;
    }

    svg.setPointerCapture(event.pointerId);
    setDragState({
      index: nearestPointIndex,
      pointerId: event.pointerId,
    });
    movePoint(nearestPointIndex, pointer.x, pointer.y);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const pointer = getPointerPosition(svg, event.clientX, event.clientY);
    movePoint(dragState.index, pointer.x, pointer.y);
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    finishDrag(event.pointerId);
  };

  const handlePointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    finishDrag(event.pointerId);
  };

  return (
    <section className="tree-workspace">
      <header className="tree-toolbar">
        <div className="tree-toolbar-copy">
          <h1>Листва дерева</h1>
          <p>Точек: {points.length}</p>
          <p>Нажми рядом с точкой и тяни мышкой, чтобы сдвинуть её локально.</p>
        </div>
        <button
          className="tree-button"
          type="button"
          onClick={resetPoints}
          disabled={!points.length || isLoading}
        >
          Вернуть точки
        </button>
      </header>

      <div className="tree-stage">
        <div className="tree-stack">
          <img
            src={TREE_IMAGE_URL}
            alt="Дерево"
            className="tree-image"
            draggable={false}
          />

          <svg
            ref={svgRef}
            className={`leaf-overlay${dragState ? ' is-dragging' : ''}`}
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
            preserveAspectRatio="none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {points.map((point, index) => {
              const isActive = dragState?.index === index;

              return (
                <circle
                  key={point.id}
                  ref={(node) => {
                    circleRefs.current[index] = node;
                  }}
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? point.size * 1.9 : point.size}
                  fill={point.color}
                  fillOpacity={isActive ? 1 : point.opacity}
                  stroke={isActive ? '#fff8cc' : 'none'}
                  strokeWidth={isActive ? 0.09 : 0}
                />
              );
            })}
          </svg>

          {(isLoading || errorText) && (
            <div className="tree-status">
              {isLoading ? 'Загружаю точки листвы...' : errorText}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
