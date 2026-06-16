import type { Point, Rect, Tile, ViewState } from '../types';

export const TILE_SIZE = 256;
export const MAX_ZOOM = 6;
export const MIN_ZOOM = 0;
export const DEFAULT_SCALE = 1;

export function worldToScreen(point: Point, view: ViewState): Point {
  return {
    x: point.x * view.scale + view.x,
    y: point.y * view.scale + view.y,
  };
}

export function screenToWorld(point: Point, view: ViewState): Point {
  return {
    x: (point.x - view.x) / view.scale,
    y: (point.y - view.y) / view.scale,
  };
}

export function getTilesForViewport(
  viewport: Rect,
  view: ViewState,
  blueprintWidth: number,
  blueprintHeight: number,
): Tile[] {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Math.log2(view.scale))));
  const scaleAtZ = Math.pow(2, z);
  const tileSizeScaled = TILE_SIZE * view.scale / scaleAtZ;

  const worldLeft = (0 - view.x) / view.scale;
  const worldTop = (0 - view.y) / view.scale;
  const worldRight = (viewport.width - view.x) / view.scale;
  const worldBottom = (viewport.height - view.y) / view.scale;

  const tilesX = Math.ceil(blueprintWidth * scaleAtZ / TILE_SIZE);
  const tilesY = Math.ceil(blueprintHeight * scaleAtZ / TILE_SIZE);

  const startX = Math.max(0, Math.floor(worldLeft * scaleAtZ / TILE_SIZE));
  const startY = Math.max(0, Math.floor(worldTop * scaleAtZ / TILE_SIZE));
  const endX = Math.min(tilesX - 1, Math.ceil(worldRight * scaleAtZ / TILE_SIZE));
  const endY = Math.min(tilesY - 1, Math.ceil(worldBottom * scaleAtZ / TILE_SIZE));

  const tiles: Tile[] = [];
  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      tiles.push({
        z,
        x: tx,
        y: ty,
        url: `/api/tiles/{blueprintId}/${z}/${tx}/${ty}`,
      });
    }
  }
  return tiles;
}

export function getTileScreenRect(
  tile: Tile,
  view: ViewState,
): Rect {
  const scaleAtZ = Math.pow(2, tile.z);
  return {
    x: tile.x * TILE_SIZE * view.scale / scaleAtZ + view.x,
    y: tile.y * TILE_SIZE * view.scale / scaleAtZ + view.y,
    width: TILE_SIZE * view.scale / scaleAtZ,
    height: TILE_SIZE * view.scale / scaleAtZ,
  };
}

export function clampScale(scale: number): number {
  const min = Math.pow(2, MIN_ZOOM) * 0.5;
  const max = Math.pow(2, MAX_ZOOM) * 2;
  return Math.max(min, Math.min(max, scale));
}

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function getDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
