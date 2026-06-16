package com.blueprint.websocket;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class CollabWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final CollabRoomManager roomManager;

    private final Map<String, SessionMeta> sessionMetaMap = new ConcurrentHashMap<>();

    private record SessionMeta(String blueprintId, String userId) {}

    public CollabWebSocketHandler(CollabRoomManager roomManager, ObjectMapper objectMapper) {
        this.roomManager = roomManager;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String blueprintId = getQueryParam(session, "blueprintId");
        String userId = getQueryParam(session, "userId");

        if (blueprintId == null || userId == null) {
            try {
                session.close(CloseStatus.BAD_DATA.withReason("Missing blueprintId or userId"));
            } catch (Exception ignored) {
            }
            return;
        }

        sessionMetaMap.put(session.getId(), new SessionMeta(blueprintId, userId));

        try {
            roomManager.addSession(blueprintId, userId, session);
        } catch (Exception e) {
            log.error("Failed to register session {}", session.getId(), e);
            sessionMetaMap.remove(session.getId());
            try {
                session.close(CloseStatus.SERVER_ERROR);
            } catch (Exception ignored) {
            }
            return;
        }

        log.info("WebSocket connected: session={}, blueprint={}, user={}",
                session.getId(), blueprintId, userId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        SessionMeta meta = sessionMetaMap.get(session.getId());
        if (meta == null) return;

        String blueprintId = meta.blueprintId();
        String userId = meta.userId();

        WSMessage<?> msg;
        try {
            msg = objectMapper.readValue(message.getPayload(), WSMessage.class);
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse WS message from session {}: {}",
                    session.getId(), e.getOriginalMessage());
            return;
        } catch (Exception e) {
            log.error("Unexpected parse error from session {}", session.getId(), e);
            return;
        }

        WSMessageType type;
        try {
            type = WSMessageType.fromValue(msg.getType());
        } catch (IllegalArgumentException e) {
            log.warn("Unknown WS message type '{}' from session {}", msg.getType(), session.getId());
            return;
        }

        try {
            switch (type) {
                case SYNC_REQUEST -> roomManager.handleSyncRequest(blueprintId, session);
                case CURSOR_MOVE, USER_JOIN, ANNOTATION_CREATE,
                     ANNOTATION_UPDATE, ANNOTATION_DELETE -> {
                    roomManager.broadcast(blueprintId, message.getPayload(), session);
                    if (type == WSMessageType.ANNOTATION_CREATE
                            || type == WSMessageType.ANNOTATION_UPDATE
                            || type == WSMessageType.ANNOTATION_DELETE) {
                        roomManager.persistAnnotation(msg);
                    }
                }
                default -> roomManager.broadcast(blueprintId, message.getPayload(), session);
            }
        } catch (Exception e) {
            log.error("Error dispatching WS message (type={}) from session={} user={}",
                    type, session.getId(), userId, e);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        SessionMeta meta = sessionMetaMap.remove(session.getId());
        if (meta == null) return;

        String blueprintId = meta.blueprintId();
        String userId = meta.userId();

        try {
            roomManager.removeSession(blueprintId, userId, session);
        } catch (Exception e) {
            log.error("Failed to remove session {} from room {}", session.getId(), blueprintId, e);
        }

        WSMessage<String> leaveMsg = WSMessage.<String>builder()
                .type(WSMessageType.USER_LEAVE.getValue())
                .payload(userId)
                .senderId(userId)
                .timestamp(System.currentTimeMillis())
                .blueprintId(blueprintId)
                .build();

        try {
            roomManager.broadcast(blueprintId, objectMapper.writeValueAsString(leaveMsg), null);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize leave message for user {}", userId, e);
        } catch (Exception e) {
            log.error("Failed to broadcast leave for user {}", userId, e);
        }

        log.info("WebSocket closed: session={}, blueprint={}, user={}, status={}",
                session.getId(), blueprintId, userId, status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        SessionMeta meta = sessionMetaMap.get(session.getId());
        String userId = meta != null ? meta.userId() : "?";
        String blueprintId = meta != null ? meta.blueprintId() : "?";

        if (exception instanceof java.io.IOException
                || "Connection reset".equals(exception.getMessage())
                || "Broken pipe".equals(exception.getMessage())) {
            log.debug("Transport error (disconnect) session={} user={} blueprint={}: {}",
                    session.getId(), userId, blueprintId, exception.getMessage());
        } else {
            log.warn("Transport error session={} user={} blueprint={}",
                    session.getId(), userId, blueprintId, exception);
        }
    }

    private static String getQueryParam(WebSocketSession session, String name) {
        URI uri = session.getUri();
        if (uri == null) return null;
        String query = uri.getQuery();
        if (query == null || query.isEmpty()) return null;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = pair.substring(0, eq);
            if (key.equals(name) && eq + 1 < pair.length()) {
                return pair.substring(eq + 1);
            }
        }
        return null;
    }
}
