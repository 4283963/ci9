export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Tile {
  z: number;
  x: number;
  y: number;
  url: string;
}

export interface ViewState {
  x: number;
  y: number;
  scale: number;
}

export type AnnotationTool = 'select' | 'pen' | 'rect' | 'circle' | 'text';

export interface BaseAnnotation {
  id: string;
  blueprintId: string;
  userId: string;
  userName: string;
  color: string;
  tool: AnnotationTool;
  createdAt: number;
  updatedAt: number;
}

export interface PenAnnotation extends BaseAnnotation {
  tool: 'pen';
  points: Point[];
}

export interface RectAnnotation extends BaseAnnotation {
  tool: 'rect';
  rect: Rect;
}

export interface CircleAnnotation extends BaseAnnotation {
  tool: 'circle';
  center: Point;
  radius: number;
}

export interface TextAnnotation extends BaseAnnotation {
  tool: 'text';
  position: Point;
  text: string;
}

export type Annotation = PenAnnotation | RectAnnotation | CircleAnnotation | TextAnnotation;

export interface CollaborativeUser {
  id: string;
  name: string;
  color: string;
  cursor?: Point;
  lastActive: number;
}

export type WSMessageType =
  | 'annotation:create'
  | 'annotation:update'
  | 'annotation:delete'
  | 'cursor:move'
  | 'user:join'
  | 'user:leave'
  | 'sync:request'
  | 'sync:response';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
  senderId: string;
  timestamp: number;
  blueprintId: string;
}
