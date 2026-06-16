import { useRef, useEffect, useCallback } from 'react';
import { TileCanvas } from './TileCanvas';
import { AnnotationCanvas } from './AnnotationCanvas';
import { useCanvasStore } from '../../store/canvasStore';
import { createPanZoomController } from '../../hooks/usePanZoom';
import { useCollaboration } from '../../hooks/useCollaboration';
import type { Annotation } from '../../types';

interface BlueprintCanvasProps {
  blueprintId: string;
  userId: string;
  userName: string;
}

export function BlueprintCanvas({ blueprintId, userId, userName }: BlueprintCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileCanvasWrapRef = useRef<HTMLDivElement>(null);
  const panZoomRef = useRef<ReturnType<typeof createPanZoomController> | null>(null);
  const setView = useCanvasStore((s) => s.setView);
  const view = useCanvasStore((s) => s.view);
  const addAnnotation = useCanvasStore((s) => s.addAnnotation);

  useCollaboration(blueprintId, userId, userName);

  useEffect(() => {
    const container = tileCanvasWrapRef.current;
    const canvas = container?.querySelector('canvas');
    if (!canvas) return;

    const controller = createPanZoomController(canvas, view, {
      onStateChange: (s) => {
        setView({ ...s });
      },
    });
    panZoomRef.current = controller;

    return () => {
      controller.destroy();
    };
  }, [setView, view]);

  const handleDrawingEnd = useCallback(
    (ann: Annotation) => {
      const finalAnn = { ...ann, blueprintId };
      addAnnotation(finalAnn);
    },
    [blueprintId, addAnnotation],
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#f0f0f0',
        userSelect: 'none',
      }}
    >
      <div ref={tileCanvasWrapRef} style={{ position: 'absolute', inset: 0 }}>
        <TileCanvas blueprintId={blueprintId} />
      </div>
      <AnnotationCanvas
        onDrawingEnd={handleDrawingEnd}
      />
    </div>
  );
}
