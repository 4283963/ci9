import { create } from 'zustand';
import type {
  Annotation,
  AnnotationTool,
  CollaborativeUser,
  ViewState,
  WSMessage,
} from '../types';

interface CanvasState {
  blueprintId: string;
  blueprintWidth: number;
  blueprintHeight: number;
  view: ViewState;
  tool: AnnotationTool;
  color: string;
  annotations: Annotation[];
  users: Record<string, CollaborativeUser>;
  drawingAnnotation: Annotation | null;
  isPanning: boolean;
  isLoading: boolean;

  setView: (view: ViewState) => void;
  setTool: (tool: AnnotationTool) => void;
  setColor: (color: string) => void;
  setDrawingAnnotation: (ann: Annotation | null) => void;
  addAnnotation: (ann: Annotation) => void;
  updateAnnotation: (ann: Annotation) => void;
  deleteAnnotation: (id: string) => void;
  setAnnotations: (anns: Annotation[]) => void;
  addUser: (user: CollaborativeUser) => void;
  removeUser: (userId: string) => void;
  updateUserCursor: (userId: string, cursor: { x: number; y: number }) => void;
  setBlueprintInfo: (id: string, w: number, h: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  blueprintId: '',
  blueprintWidth: 4096,
  blueprintHeight: 2896,
  view: { x: 0, y: 0, scale: 1 },
  tool: 'pen',
  color: '#ff3b30',
  annotations: [],
  users: {},
  drawingAnnotation: null,
  isPanning: false,
  isLoading: false,

  setView: (view) => set({ view }),
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setDrawingAnnotation: (drawingAnnotation) => set({ drawingAnnotation }),

  addAnnotation: (ann) =>
    set((s) => ({ annotations: [...s.annotations, ann] })),
  updateAnnotation: (ann) =>
    set((s) => ({
      annotations: s.annotations.map((a) => (a.id === ann.id ? ann : a)),
    })),
  deleteAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
  setAnnotations: (annotations) => set({ annotations }),

  addUser: (user) =>
    set((s) => ({ users: { ...s.users, [user.id]: user } })),
  removeUser: (userId) =>
    set((s) => {
      const { [userId]: _, ...rest } = s.users;
      return { users: rest };
    }),
  updateUserCursor: (userId, cursor) =>
    set((s) => {
      const user = s.users[userId];
      if (!user) return s;
      return {
        users: {
          ...s.users,
          [userId]: { ...user, cursor, lastActive: Date.now() },
        },
      };
    }),

  setBlueprintInfo: (blueprintId, blueprintWidth, blueprintHeight) =>
    set({ blueprintId, blueprintWidth, blueprintHeight }),
  setLoading: (isLoading) => set({ isLoading }),
}));

export function applyWSMessage(msg: WSMessage) {
  const state = useCanvasStore.getState();
  switch (msg.type) {
    case 'annotation:create':
      state.addAnnotation(msg.payload as Annotation);
      break;
    case 'annotation:update':
      state.updateAnnotation(msg.payload as Annotation);
      break;
    case 'annotation:delete':
      state.deleteAnnotation((msg.payload as { id: string }).id);
      break;
    case 'user:join':
      state.addUser(msg.payload as CollaborativeUser);
      break;
    case 'user:leave':
      state.removeUser((msg.payload as { id: string }).id);
      break;
    case 'cursor:move': {
      const p = msg.payload as { userId: string; x: number; y: number };
      state.updateUserCursor(p.userId, { x: p.x, y: p.y });
      break;
    }
    case 'sync:response': {
      const p = msg.payload as { annotations: Annotation[]; users: CollaborativeUser[] };
      state.setAnnotations(p.annotations);
      p.users.forEach((u) => state.addUser(u));
      break;
    }
  }
}
