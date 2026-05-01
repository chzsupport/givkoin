const REFERENCE_WIDTH = 1400;
const REFERENCE_HEIGHT = 900;

const INITIAL = {
  left: 530.574557,
  top: 78.310053,
  width: 364.548866,
  height: 420.322061,
};

const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const resetBtn = document.getElementById('resetBtn');
const copyBtn = document.getElementById('copyBtn');

const fields = {
  left: document.getElementById('leftValue'),
  top: document.getElementById('topValue'),
  width: document.getElementById('widthValue'),
  height: document.getElementById('heightValue'),
  leftPct: document.getElementById('leftPercentValue'),
  topPct: document.getElementById('topPercentValue'),
  widthPct: document.getElementById('widthPercentValue'),
  heightPct: document.getElementById('heightPercentValue'),
};

let state = { ...INITIAL };
let pointerState = null;
let lastMoveLogAt = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getStageRect() {
  return stage.getBoundingClientRect();
}

function getScreenState() {
  const rect = getStageRect();
  const scaleX = rect.width / REFERENCE_WIDTH;
  const scaleY = rect.height / REFERENCE_HEIGHT;
  return {
    left: state.left * scaleX,
    top: state.top * scaleY,
    width: state.width * scaleX,
    height: state.height * scaleY,
  };
}

function setOverlayStyle() {
  const screen = getScreenState();
  overlay.style.left = `${screen.left}px`;
  overlay.style.top = `${screen.top}px`;
  overlay.style.width = `${screen.width}px`;
  overlay.style.height = `${screen.height}px`;
  fields.left.textContent = state.left.toFixed(2);
  fields.top.textContent = state.top.toFixed(2);
  fields.width.textContent = state.width.toFixed(2);
  fields.height.textContent = state.height.toFixed(2);
  fields.leftPct.textContent = ((state.left / REFERENCE_WIDTH) * 100).toFixed(3);
  fields.topPct.textContent = ((state.top / REFERENCE_HEIGHT) * 100).toFixed(3);
  fields.widthPct.textContent = ((state.width / REFERENCE_WIDTH) * 100).toFixed(3);
  fields.heightPct.textContent = ((state.height / REFERENCE_HEIGHT) * 100).toFixed(3);
}

async function postLog(action, payload) {
  const body = {
    action,
    payload,
    at: new Date().toISOString(),
  };
  try {
    await fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_error) {
    // If logging server is unreachable, keep the tool usable.
  }
}

function emitState(action) {
  const payload = {
    left: Number(state.left.toFixed(6)),
    top: Number(state.top.toFixed(6)),
    width: Number(state.width.toFixed(6)),
    height: Number(state.height.toFixed(6)),
    leftPercent: Number(((state.left / REFERENCE_WIDTH) * 100).toFixed(6)),
    topPercent: Number(((state.top / REFERENCE_HEIGHT) * 100).toFixed(6)),
    widthPercent: Number(((state.width / REFERENCE_WIDTH) * 100).toFixed(6)),
    heightPercent: Number(((state.height / REFERENCE_HEIGHT) * 100).toFixed(6)),
    referenceWidth: REFERENCE_WIDTH,
    referenceHeight: REFERENCE_HEIGHT,
  };
  postLog(action, payload);
}

function beginPointer(event, mode, handle = null) {
  event.preventDefault();
  const stageRect = getStageRect();
  const scaleX = REFERENCE_WIDTH / stageRect.width;
  const scaleY = REFERENCE_HEIGHT / stageRect.height;
  pointerState = {
    mode,
    handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startState: { ...state },
    scaleX,
    scaleY,
  };
  overlay.setPointerCapture(event.pointerId);
  emitState(mode === 'move' ? 'move-start' : `resize-${handle}-start`);
}

function onPointerMove(event) {
  if (!pointerState) return;

  const dx = (event.clientX - pointerState.startClientX) * pointerState.scaleX;
  const dy = (event.clientY - pointerState.startClientY) * pointerState.scaleY;

  if (pointerState.mode === 'move') {
    state.left = pointerState.startState.left + dx;
    state.top = pointerState.startState.top + dy;
  } else {
    const next = { ...pointerState.startState };
    const minWidth = 40;
    const minHeight = 40;

    if (pointerState.handle.includes('e')) {
      next.width = pointerState.startState.width + dx;
    }
    if (pointerState.handle.includes('s')) {
      next.height = pointerState.startState.height + dy;
    }
    if (pointerState.handle.includes('w')) {
      next.left = pointerState.startState.left + dx;
      next.width = pointerState.startState.width - dx;
    }
    if (pointerState.handle.includes('n')) {
      next.top = pointerState.startState.top + dy;
      next.height = pointerState.startState.height - dy;
    }

    if (next.width < minWidth) {
      if (pointerState.handle.includes('w')) {
        next.left -= (minWidth - next.width);
      }
      next.width = minWidth;
    }

    if (next.height < minHeight) {
      if (pointerState.handle.includes('n')) {
        next.top -= (minHeight - next.height);
      }
      next.height = minHeight;
    }

    state = next;
  }

  state.left = clamp(state.left, -REFERENCE_WIDTH, REFERENCE_WIDTH * 2);
  state.top = clamp(state.top, -REFERENCE_HEIGHT, REFERENCE_HEIGHT * 2);
  state.width = clamp(state.width, 40, REFERENCE_WIDTH * 3);
  state.height = clamp(state.height, 40, REFERENCE_HEIGHT * 3);

  setOverlayStyle();

  const now = performance.now();
  if (now - lastMoveLogAt > 90) {
    lastMoveLogAt = now;
    emitState(pointerState.mode === 'move' ? 'move' : `resize-${pointerState.handle}`);
  }
}

function finishPointer(event) {
  if (!pointerState) return;
  try {
    overlay.releasePointerCapture(event.pointerId);
  } catch (_error) {
    // ignore
  }
  emitState(pointerState.mode === 'move' ? 'move-end' : `resize-${pointerState.handle}-end`);
  pointerState = null;
}

overlay.addEventListener('pointerdown', (event) => {
  const handle = event.target instanceof HTMLElement ? event.target.dataset.handle : null;
  beginPointer(event, handle ? 'resize' : 'move', handle);
});

overlay.addEventListener('pointermove', onPointerMove);
overlay.addEventListener('pointerup', finishPointer);
overlay.addEventListener('pointercancel', finishPointer);

resetBtn.addEventListener('click', () => {
  state = { ...INITIAL };
  setOverlayStyle();
  emitState('reset');
});

copyBtn.addEventListener('click', async () => {
  const payload = JSON.stringify({
    left: Number(state.left.toFixed(6)),
    top: Number(state.top.toFixed(6)),
    width: Number(state.width.toFixed(6)),
    height: Number(state.height.toFixed(6)),
    leftPercent: Number(((state.left / REFERENCE_WIDTH) * 100).toFixed(6)),
    topPercent: Number(((state.top / REFERENCE_HEIGHT) * 100).toFixed(6)),
    widthPercent: Number(((state.width / REFERENCE_WIDTH) * 100).toFixed(6)),
    heightPercent: Number(((state.height / REFERENCE_HEIGHT) * 100).toFixed(6)),
  }, null, 2);

  try {
    await navigator.clipboard.writeText(payload);
    await postLog('copy-state', { copied: true });
  } catch (_error) {
    await postLog('copy-state', { copied: false });
  }
});

window.addEventListener('resize', () => {
  setOverlayStyle();
  emitState('window-resize');
});

setOverlayStyle();
emitState('ready');
