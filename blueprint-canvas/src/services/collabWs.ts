import type { Annotation, CollaborativeUser, WSMessage, WSMessageType } from '../types';
import { applyWSMessage } from '../store/canvasStore';

type MessageHandler = (msg: WSMessage) => void;

export class CollabWebSocket {
  private ws: WebSocket | null = null;
  private blueprintId: string;
  private userId: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private url: string;

  constructor(url: string, blueprintId: string, userId: string) {
    this.url = url;
    this.blueprintId = blueprintId;
    this.userId = userId;
    this.handlers.add(applyWSMessage);
  }

  connect() {
    const fullUrl = `${this.url}?blueprintId=${this.blueprintId}&userId=${this.userId}`;
    this.ws = new WebSocket(fullUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.send('sync:request', { blueprintId: this.blueprintId });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        this.handlers.forEach((h) => h(msg));
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = (e) => {
      console.error('WS error:', e);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  send<T = unknown>(type: WSMessageType, payload: T) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: WSMessage<T> = {
      type,
      payload,
      senderId: this.userId,
      timestamp: Date.now(),
      blueprintId: this.blueprintId,
    };
    this.ws.send(JSON.stringify(msg));
  }

  createAnnotation(ann: Annotation) {
    this.send('annotation:create', ann);
  }

  updateAnnotation(ann: Annotation) {
    this.send('annotation:update', ann);
  }

  deleteAnnotation(id: string) {
    this.send('annotation:delete', { id });
  }

  moveCursor(x: number, y: number) {
    this.send('cursor:move', { userId: this.userId, x, y });
  }

  join(user: CollaborativeUser) {
    this.send('user:join', user);
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.send('user:leave', { id: this.userId });
    this.ws?.close();
    this.ws = null;
  }
}
