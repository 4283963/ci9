import { useEffect, useRef, useCallback } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { screenToWorld, worldToScreen } from '../../utils/geometry';
import type {
  Annotation,
  PenAnnotation,
  RectAnnotation,
  CircleAnnotation,
  TextAnnotation,
  Point,
  ViewState,
} from '../../types';

interface AnnotationCanvasProps {
  onDrawingStart?: (ann: Annotation) => void;
  onDrawingMove?: (ann: Annotation) => void;
  onDrawingEnd?: (ann: Annotation) => void;
}

function generateId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AnnotationCanvas({
  onDrawingStart,
  onDrawingMove,
  onDrawingEnd,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const view = useCanvasStore((s) => s.view);
  const tool = useCanvasStore((s) => s.tool);
  const color = useCanvasStore((s) => s.color);
  const annotations = useCanvasStore((s) => s.annotations);
  const drawingAnnotation = useCanvasStore((s) => s.drawingAnnotation);
  const users = useCanvasStore((s) => s.users);
  const setDrawingAnnotation = useCanvasStore((s) => s.setDrawingAnnotation);

  const viewRef = useRef<ViewState>(view);
  const drawingRef = useRef<Annotation | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const animationRef = useRef<number>(0);
  const userIdRef = useRef<string>('local_user');

  useEffect(() => {
    viewRef.current = view;
    scheduleRender();
  }, [view]);

  useEffect(() => {
    drawingRef.current = drawingAnnotation;
    scheduleRender();
  }, [drawingAnnotation]);

  useEffect(() => {
    scheduleRender();
  }, [annotations, users]);

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

  const scheduleRender = useCallback(() => {
    if (animationRef.current) return;
    animationRef.current = requestAnimationFrame(render);
  }, []);

  const render = useCallback(() => {
    animationRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const v = viewRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    for (const ann of annotations) {
      drawAnnotation(ctx, ann, v);
    }

    if (drawingRef.current) {
      drawAnnotation(ctx, drawingRef.current, v, true);
    }

    for (const user of Object.values(users)) {
      if (user.cursor && user.id !== userIdRef.current) {
        drawCursor(ctx, user.cursor, user.color, user.name, v);
      }
    }
  }, [annotations, users]);

  function drawAnnotation(
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    view: ViewState,
    isDrawing = false,
  ) {
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color + '20';
    ctx.lineWidth = Math.max(1.5, 2 / view.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isDrawing) {
      ctx.setLineDash([5 / view.scale, 5 / view.scale]);
    }

    switch (ann.tool) {
      case 'pen': {
        const points = (ann as PenAnnotation).points;
        if (points.length < 2) {
          const p = worldToScreen(points[0] || { x: 0, y: 0 }, view);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = ann.color;
          ctx.fill();
          break;
        }
        ctx.beginPath();
        const first = worldToScreen(points[0], view);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i++) {
          const p = worldToScreen(points[i], view);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        break;
      }
      case 'rect': {
        const r = (ann as RectAnnotation).rect;
        const tl = worldToScreen({ x: r.x, y: r.y }, view);
        const br = worldToScreen({ x: r.x + r.width, y: r.y + r.height }, view);
        ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        break;
      }
      case 'circle': {
        const c = (ann as CircleAnnotation).center;
        const r = (ann as CircleAnnotation).radius;
        const center = worldToScreen(c, view);
        const radiusScreen = r * view.scale;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radiusScreen, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
        break;
      }
      case 'text': {
        const t = ann as TextAnnotation;
        const p = worldToScreen(t.position, view);
        ctx.font = `${14 * Math.max(1, view.scale)}px sans-serif`;
        ctx.fillStyle = ann.color;
        ctx.fillText(t.text, p.x, p.y);
        break;
      }
    }

    ctx.restore();
  }

  function drawCursor(
    ctx: CanvasRenderingContext2D,
    point: Point,
    color: string,
    name: string,
    view: ViewState,
  ) {
    const p = worldToScreen(point, view);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 10, p.y + 4);
    ctx.lineTo(p.x + 4, p.y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const textW = ctx.measureText(name).width;
    ctx.strokeText(name, p.x + 12, p.y + 12);
    ctx.fillText(name, p.x + 12, p.y + 12);

    ctx.restore();
  }

  const getCanvasPoint = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      viewRef.current,
    );
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (tool === 'select') return;

    const point = getCanvasPoint(e);
    startPointRef.current = point;

    const base = {
      id: generateId(),
      blueprintId: '',
      userId: userIdRef.current,
      userName: '当前用户',
      color,
      tool,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    let ann: Annotation;
    switch (tool) {
      case 'pen':
        ann = { ...base, tool: 'pen', points: [point] } as PenAnnotation;
        break;
      case 'rect':
        ann = { ...base, tool: 'rect', rect: { x: point.x, y: point.y, width: 0, height: 0 } } as RectAnnotation;
        break;
      case 'circle':
        ann = { ...base, tool: 'circle', center: point, radius: 0 } as CircleAnnotation;
        break;
      case 'text':
        ann = { ...base, tool: 'text', position: point, text: '批注文字' } as TextAnnotation;
        break;
      default:
        return;
    }

    drawingRef.current = ann;
    setDrawingAnnotation(ann);
    onDrawingStart?.(ann);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const point = getCanvasPoint(e);

    if (!drawingRef.current) return;

    const ann = drawingRef.current;
    const start = startPointRef.current || point;

    switch (ann.tool) {
      case 'pen': {
        const pen = ann as PenAnnotation;
        pen.points.push(point);
        break;
      }
      case 'rect': {
        const rectAnn = ann as RectAnnotation;
        rectAnn.rect = {
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          width: Math.abs(point.x - start.x),
          height: Math.abs(point.y - start.y),
        };
        break;
      }
      case 'circle': {
        const circ = ann as CircleAnnotation;
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        circ.radius = Math.sqrt(dx * dx + dy * dy);
        break;
      }
    }

    ann.updatedAt = Date.now();
    setDrawingAnnotation({ ...ann });
    onDrawingMove?.(ann);
  };

  const handleMouseUp = () => {
    if (!drawingRef.current) return;
    const ann = drawingRef.current;
    onDrawingEnd?.(ann);
    drawingRef.current = null;
    setDrawingAnnotation(null);
  };

  const cursorStyle = tool === 'select' ? 'default' : 'crosshair';

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: cursorStyle }}
      />
    </div>
  );
}
