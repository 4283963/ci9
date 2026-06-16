import { useCanvasStore } from '../store/canvasStore';
import type { AnnotationTool } from '../types';

const TOOLS: { id: AnnotationTool; label: string; icon: string }[] = [
  { id: 'select', label: '选择', icon: '↖' },
  { id: 'pen', label: '画笔', icon: '✎' },
  { id: 'rect', label: '矩形', icon: '▢' },
  { id: 'circle', label: '圆形', icon: '◯' },
  { id: 'text', label: '文字', icon: 'T' },
  { id: 'voice', label: '语音', icon: '🎤' },
];

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#ff2d55'];

export function Toolbar() {
  const tool = useCanvasStore((s) => s.tool);
  const color = useCanvasStore((s) => s.color);
  const setTool = useCanvasStore((s) => s.setTool);
  const setColor = useCanvasStore((s) => s.setColor);
  const users = useCanvasStore((s) => s.users);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        background: 'rgba(255,255,255,0.95)',
        borderRadius: 10,
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={t.label}
            style={{
              width: 32,
              height: 32,
              border: 'none',
              borderRadius: 6,
              background: tool === t.id ? '#007aff' : 'transparent',
              color: tool === t.id ? 'white' : '#333',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div
        style={{
          height: 1,
          background: '#eee',
          margin: '4px 0',
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: 32 }}>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            title={c}
            style={{
              width: 14,
              height: 14,
              border: color === c ? '2px solid #333' : '1px solid #ddd',
              borderRadius: '50%',
              background: c,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>

      {Object.keys(users).length > 0 && (
        <>
          <div style={{ height: 1, background: '#eee', margin: '4px 0' }} />
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
            在线: {Object.keys(users).length}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.values(users).map((u) => (
              <div
                key={u.id}
                title={u.name}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: u.color,
                  border: '2px solid white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
