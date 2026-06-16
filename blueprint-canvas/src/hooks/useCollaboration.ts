import { useEffect, useRef } from 'react';
import { CollabWebSocket } from '../services/collabWs';
import { useCanvasStore } from '../store/canvasStore';
import type { CollaborativeUser } from '../types';

const WS_URL = (import.meta as unknown as { env: Record<string, string> }).env.VITE_WS_URL || '/ws/collab';

export function useCollaboration(
  blueprintId: string,
  userId: string,
  userName: string,
) {
  const wsRef = useRef<CollabWebSocket | null>(null);
  const setBlueprintInfo = useCanvasStore((s) => s.setBlueprintInfo);

  useEffect(() => {
    if (!blueprintId || !userId) return;

    const ws = new CollabWebSocket(WS_URL, blueprintId, userId);
    wsRef.current = ws;
    ws.connect();

    const user: CollaborativeUser = {
      id: userId,
      name: userName,
      color: '#007aff',
      lastActive: Date.now(),
    };
    setTimeout(() => ws.join(user), 100);

    setBlueprintInfo(blueprintId, 4096, 2896);

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [blueprintId, userId, userName, setBlueprintInfo]);

  return wsRef;
}

export function useCollabWS() {
  const wsRef = useRef<CollabWebSocket | null>(null);
  return {
    setWS: (ws: CollabWebSocket | null) => {
      wsRef.current = ws;
    },
    getWS: () => wsRef.current,
  };
}
