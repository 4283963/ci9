import { useEffect, useRef, useCallback, useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore';
import { getDistance, screenToWorld, worldToScreen } from '../../utils/geometry';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { uploadVoice } from '../../services/voiceApi';
import type {
  Annotation,
  CircleAnnotation,
  PenAnnotation,
  Point,
  RectAnnotation,
  TextAnnotation,
  ViewState,
  VoiceAnnotation,
} from '../../types';

interface AnnotationCanvasProps {
  onDrawingStart?: (ann: Annotation) => void;
  onDrawingMove?: (ann: Annotation) => void;
  onDrawingEnd?: (ann: Annotation) => void;
}

function generateId() {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_VOICE_RADIUS = 60;
const PLAYING_PULSE_PERIOD = 1200;

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

  const {
    state: recording,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  const voiceAnchorRef = useRef<{ point: Point; id: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingIdRef = useRef<string | null>(null);
  const pulseStartRef = useRef<number>(0);

  const [hoverVoiceId, setHoverVoiceId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ id: string; progress: number } | null>(null);

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
  }, [annotations, users, hoverVoiceId, recording.isRecording, recording.duration, recording.amplitude, uploading]);

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

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
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
      drawAnnotation(ctx, ann, v, false, {
        hovered: hoverVoiceId === ann.id,
        playing: playingIdRef.current === ann.id,
        nowTs: performance.now(),
      });
    }

    if (drawingRef.current) {
      drawAnnotation(ctx, drawingRef.current, v, true);
    }

    if (recording.isRecording && voiceAnchorRef.current) {
      drawRecordingIndicator(
        ctx,
        voiceAnchorRef.current.point,
        v,
        recording.duration,
        recording.amplitude,
      );
    }

    if (uploading && voiceAnchorRef.current) {
      drawUploadIndicator(ctx, voiceAnchorRef.current.point, v, uploading.progress);
    }

    for (const user of Object.values(users)) {
      if (user.cursor && user.id !== userIdRef.current) {
        drawCursor(ctx, user.cursor, user.color, user.name, v);
      }
    }

    if (playingIdRef.current) {
      if (performance.now() - pulseStartRef.current > PLAYING_PULSE_PERIOD) {
        pulseStartRef.current = performance.now();
      }
      scheduleRender();
    }
  }, [annotations, users, hoverVoiceId, recording.isRecording, recording.duration, recording.amplitude, uploading]);

  function drawAnnotation(
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    view: ViewState,
    isDrawing = false,
    opts?: {
      hovered?: boolean;
      playing?: boolean;
      nowTs?: number;
    },
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
      case 'voice': {
        drawVoiceAnnotation(ctx, ann as VoiceAnnotation, view, {
          isDrawing,
          hovered: opts?.hovered,
          playing: opts?.playing,
          nowTs: opts?.nowTs || performance.now(),
        });
        break;
      }
    }

    ctx.restore();
  }

  function drawVoiceAnnotation(
    ctx: CanvasRenderingContext2D,
    ann: VoiceAnnotation,
    view: ViewState,
    opts: {
      isDrawing: boolean;
      hovered?: boolean;
      playing?: boolean;
      nowTs: number;
    },
  ) {
    const center = worldToScreen(ann.position, view);
    const radiusScreen = Math.max(24, ann.radius * view.scale);

    if (opts.playing) {
      const t = ((opts.nowTs - pulseStartRef.current) % PLAYING_PULSE_PERIOD) / PLAYING_PULSE_PERIOD;
      const pulseR = radiusScreen + t * radiusScreen * 0.8;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 2 / view.scale;
      ctx.beginPath();
      ctx.arc(center.x, center.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color + (opts.hovered ? '40' : '25');
    ctx.lineWidth = Math.max(2, 3 / view.scale);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusScreen, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const iconSize = Math.max(16, radiusScreen * 0.65);
    drawSpeakerIcon(ctx, center.x, center.y, iconSize, ann.color);

    const mins = Math.floor(ann.duration / 60);
    const secs = Math.floor(ann.duration % 60);
    const label = `${mins}:${secs.toString().padStart(2, '0')}`;
    ctx.font = `${Math.max(10, 11 * Math.max(0.8, view.scale))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ann.color;
    ctx.fillText(label, center.x, center.y + radiusScreen + Math.max(14, 14 * Math.max(0.8, view.scale)));
    ctx.textAlign = 'left';
  }

  function drawSpeakerIcon(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    color: string,
  ) {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size / 24;
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-3, -6);
    ctx.lineTo(-9, -6);
    ctx.lineTo(-9, 6);
    ctx.lineTo(-3, 6);
    ctx.lineTo(5, 10);
    ctx.lineTo(5, -10);
    ctx.lineTo(-3, -6);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(8, 0, 5, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, 0, 8, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
    ctx.restore();
  }

  function drawRecordingIndicator(
    ctx: CanvasRenderingContext2D,
    point: Point,
    view: ViewState,
    duration: number,
    amplitude: number,
  ) {
    const p = worldToScreen(point, view);
    const baseR = Math.max(28, DEFAULT_VOICE_RADIUS * view.scale);
    const pulse = baseR + Math.sin(performance.now() / 200) * 4 + amplitude * baseR * 0.6;

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = Math.max(2, 3 / view.scale);
    ctx.fillStyle = '#ff3b3040';
    ctx.beginPath();
    ctx.arc(p.x, p.y, baseR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff3b30';
    const dotR = Math.max(6, 9 * Math.max(0.6, view.scale));
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fill();

    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const text = `${mins}:${secs.toString().padStart(2, '0')} ●REC`;
    ctx.font = `bold ${Math.max(12, 13 * Math.max(0.9, view.scale))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff3b30';
    ctx.fillText(text, p.x, p.y - baseR - Math.max(8, 8 * Math.max(0.8, view.scale)));
    ctx.textAlign = 'left';

    const waveCount = 5;
    const waveWidth = 3 * Math.max(1, view.scale);
    const waveMax = baseR * 0.5;
    for (let i = 0; i < waveCount; i++) {
      const x = p.x + (i - (waveCount - 1) / 2) * waveWidth * 2.4;
      const h = (0.2 + Math.abs(Math.sin(performance.now() / 120 + i)) * 0.8) * waveMax * (amplitude * 3 + 0.5);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(x - waveWidth / 2, p.y - h / 2, waveWidth, Math.max(2, h));
    }

    ctx.restore();
  }

  function drawUploadIndicator(
    ctx: CanvasRenderingContext2D,
    point: Point,
    view: ViewState,
    progress: number,
  ) {
    const p = worldToScreen(point, view);
    const r = Math.max(28, DEFAULT_VOICE_RADIUS * view.scale);
    ctx.save();
    ctx.strokeStyle = '#007aff';
    ctx.fillStyle = '#007aff20';
    ctx.lineWidth = Math.max(2, 3 / view.scale);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#007aff';
    ctx.lineWidth = Math.max(3, 4 / view.scale);
    ctx.arc(p.x, p.y, r + 5, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2);
    ctx.stroke();

    ctx.font = `bold ${Math.max(12, 13 * Math.max(0.9, view.scale))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#007aff';
    ctx.fillText(`上传 ${progress}%`, p.x, p.y + 4);
    ctx.textAlign = 'left';
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

  function findVoiceAtPoint(point: Point, view: ViewState): VoiceAnnotation | null {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.tool !== 'voice') continue;
      const va = ann as VoiceAnnotation;
      const dist = getDistance(point, va.position);
      if (dist <= va.radius) return va;
    }
    return null;
  }

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    if (recording.isRecording) return;

    const point = getCanvasPoint(e);
    const v = viewRef.current;

    if (tool === 'select' || tool === 'voice') {
      const voice = findVoiceAtPoint(point, v);
      if (voice) {
        playVoice(voice);
        return;
      }
    }

    if (tool === 'voice') {
      const id = generateId();
      voiceAnchorRef.current = { point, id };
      await startRecording();
      return;
    }

    if (tool === 'select') return;

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
    const v = viewRef.current;

    if (tool === 'select' || tool === 'voice') {
      const voice = findVoiceAtPoint(point, v);
      const newHover = voice ? voice.id : null;
      setHoverVoiceId((prev) => (prev === newHover ? prev : newHover));
    }

    if (recording.isRecording) return;
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

  const handleMouseUp = async () => {
    if (recording.isRecording && voiceAnchorRef.current) {
      await finishVoiceRecording();
      return;
    }

    if (!drawingRef.current) return;
    const ann = drawingRef.current;
    onDrawingEnd?.(ann);
    drawingRef.current = null;
    setDrawingAnnotation(null);
  };

  const handleMouseLeave = async () => {
    if (recording.isRecording) {
      await finishVoiceRecording();
      return;
    }
    if (!drawingRef.current) return;
    const ann = drawingRef.current;
    onDrawingEnd?.(ann);
    drawingRef.current = null;
    setDrawingAnnotation(null);
  };

  async function finishVoiceRecording() {
    const anchor = voiceAnchorRef.current;
    voiceAnchorRef.current = null;

    const result = await stopRecording();
    if (!result || !anchor) {
      cancelRecording();
      scheduleRender();
      return;
    }

    const tempId = anchor.id;
    setUploading({ id: tempId, progress: 0 });

    try {
      const blueprintId = useCanvasStore.getState().blueprintId;
      const uploadRes = await uploadVoice(
        blueprintId,
        result.blob,
        result.duration,
        (p) => setUploading({ id: tempId, progress: p }),
      );

      const userId = userIdRef.current;
      const voiceAnn: VoiceAnnotation = {
        id: uploadRes.id || tempId,
        blueprintId,
        userId,
        userName: '当前用户',
        color,
        tool: 'voice',
        position: anchor.point,
        radius: DEFAULT_VOICE_RADIUS,
        voiceUrl: uploadRes.url,
        duration: uploadRes.duration || result.duration,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      onDrawingEnd?.(voiceAnn);
    } catch (err) {
      console.error('Voice upload failed:', err);
      alert('语音上传失败，请重试');
    } finally {
      setUploading(null);
      scheduleRender();
    }
  }

  function playVoice(ann: VoiceAnnotation) {
    if (!ann.voiceUrl) return;

    if (playingIdRef.current === ann.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      playingIdRef.current = null;
      scheduleRender();
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(ann.voiceUrl);
    audioRef.current = audio;
    playingIdRef.current = ann.id;
    pulseStartRef.current = performance.now();

    audio.onended = () => {
      playingIdRef.current = null;
      audioRef.current = null;
      scheduleRender();
    };
    audio.onerror = () => {
      playingIdRef.current = null;
      audioRef.current = null;
      scheduleRender();
      alert('语音播放失败');
    };

    audio.play().catch((err) => {
      console.warn('Play failed:', err);
      alert('无法播放语音：' + (err?.message || '未知错误'));
      playingIdRef.current = null;
      audioRef.current = null;
    });

    scheduleRender();
  }

  let cursorStyle: string;
  if (recording.isRecording) {
    cursorStyle = 'progress';
  } else if (tool === 'select' || tool === 'voice') {
    cursorStyle = hoverVoiceId ? 'pointer' : 'default';
  } else {
    cursorStyle = 'crosshair';
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: cursorStyle }}
      />
    </div>
  );
}
