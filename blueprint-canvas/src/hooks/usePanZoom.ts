import type { ViewState } from '../types';
import { clampScale } from './geometry';

interface UsePanZoomOptions {
  minScale?: number;
  maxScale?: number;
  onStateChange?: (state: ViewState) => void;
}

const WHEEL_ZOOM_SPEED = 0.0015;

export function createPanZoomController(
  canvas: HTMLCanvasElement,
  initialState: ViewState = { x: 0, y: 0, scale: 1 },
  options: UsePanZoomOptions = {},
) {
  let state: ViewState = { ...initialState };
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  const setScale = (newScale: number, centerX?: number, centerY?: number) => {
    const clamped = clampScale(newScale);
    if (centerX !== undefined && centerY !== undefined) {
      const ratio = clamped / state.scale;
      state.x = centerX - (centerX - state.x) * ratio;
      state.y = centerY - (centerY - state.y) * ratio;
    }
    state.scale = clamped;
    options.onStateChange?.(state);
  };

  const setOffset = (x: number, y: number) => {
    state.x = x;
    state.y = y;
    options.onStateChange?.(state);
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    isPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    setOffset(state.x + dx, state.y + dy);
  };

  const handleMouseUp = () => {
    isPanning = false;
    canvas.style.cursor = 'grab';
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const centerX = e.clientX - rect.left;
    const centerY = e.clientY - rect.top;
    const delta = -e.deltaY * WHEEL_ZOOM_SPEED * state.scale;
    setScale(state.scale + delta, centerX, centerY);
  };

  canvas.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  canvas.style.cursor = 'grab';

  return {
    getState: () => state,
    setState: (s: ViewState) => {
      state = { ...s };
      options.onStateChange?.(state);
    },
    setScale,
    setOffset,
    destroy: () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    },
  };
}
