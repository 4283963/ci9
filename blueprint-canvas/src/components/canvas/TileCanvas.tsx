import { useEffect, useRef } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { getTilesForViewport, getTileScreenRect } from '../../utils/geometry';
import { TILE_SIZE } from '../../utils/geometry';
import type { Tile, ViewState } from '../../types';

interface TileCanvasProps {
  blueprintId: string;
}

const TILE_CACHE = new Map<string, HTMLImageElement>();
const LOADING_TILES = new Map<string, Promise<HTMLImageElement>>();

function loadTile(url: string): Promise<HTMLImageElement> {
  const cached = TILE_CACHE.get(url);
  if (cached && cached.complete) return Promise.resolve(cached);
  const loading = LOADING_TILES.get(url);
  if (loading) return loading;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      TILE_CACHE.set(url, img);
      LOADING_TILES.delete(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
  LOADING_TILES.set(url, promise);
  return promise;
}

export function TileCanvas({ blueprintId }: TileCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const view = useCanvasStore((s) => s.view);
  const blueprintWidth = useCanvasStore((s) => s.blueprintWidth);
  const blueprintHeight = useCanvasStore((s) => s.blueprintHeight);
  const viewStateRef = useRef<ViewState>(view);
  const animationFrameRef = useRef<number>(0);
  const visibleTilesRef = useRef<Tile[]>([]);

  useEffect(() => {
    viewStateRef.current = view;
    scheduleRender();
  }, [view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      scheduleRender();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const scheduleRender = () => {
    if (animationFrameRef.current) return;
    animationFrameRef.current = requestAnimationFrame(render);
  };

  const render = () => {
    animationFrameRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const viewState = viewStateRef.current;
    const rect = canvas.getBoundingClientRect();

    visibleTilesRef.current = getTilesForViewport(
      { x: 0, y: 0, width: rect.width, height: rect.height },
      viewState,
      blueprintWidth,
      blueprintHeight,
    );

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const tilesToLoad: string[] = [];

    for (const tile of visibleTilesRef.current) {
      const url = tile.url.replace('{blueprintId}', blueprintId);
      const tileRect = getTileScreenRect(tile, viewState);
      const cached = TILE_CACHE.get(url);

      if (cached && cached.complete) {
        ctx.drawImage(cached, tileRect.x, tileRect.y, tileRect.width, tileRect.height);
      } else {
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(tileRect.x, tileRect.y, tileRect.width, tileRect.height);
        tilesToLoad.push(url);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tileRect.x, tileRect.y, tileRect.width, tileRect.height);
    }

    if (tilesToLoad.length > 0) {
      Promise.all(tilesToLoad.map((u) => loadTile(u).catch(() => null))).then(() => {
        scheduleRender();
      });
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
