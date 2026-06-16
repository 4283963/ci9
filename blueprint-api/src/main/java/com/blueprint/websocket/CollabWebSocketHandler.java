package com.blueprint.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class CollabWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final CollabRoomManager roomManager;
    private final Map<String, String> sessionBlueprintMap = new ConcurrentHashMap<>();

    public CollabWebSocketHandler(CollabRoomManager roomManager) {
        this.roomManager = roomManager;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String blueprintId = getQueryParam(session, "blueprintId");
        String userId = getQueryParam(session, "userId");

        if (blueprintId == null || userId == null) {
            session.close(CloseStatus.BAD_DATA.withReason("Missing blueprintId or userId"));
            return;
        }

        sessionBlueprintMap.put(session.getId(), blueprintId);
        roomManager.addSession(blueprintId, userId, session);

        log.info("WebSocket connected: session={}, blueprint={}, user={}",
                session.getId(), blueprintId, userId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            WSMessage<?> msg = objectMapper.readValue(message.getPayload(), WSMessage.class);
            String blueprintId = sessionBlueprintMap.get(session.getId());

            if (blueprintId == null) return;

            WSMessageType type = WSMessageType.fromValue(msg.getType());

            switch (type) {
                case SYNC_REQUEST -> roomManager.handleSyncRequest(blueprintId, session);
                case CURSOR_MOVE -> roomManager.broadcast(blueprintId, message.getPayload(), session);
                case ANNOTATION_CREATE, ANNOTATION_UPDATE, ANNOTATION_DELETE -> {
                    roomManager.broadcast(blueprintId, message.getPayload(), session);
                    roomManager.persistAnnotation(msg);
                }
                case USER_JOIN -> roomManager.broadcast(blueprintId, message.getPayload(), session);
                default -> roomManager.broadcast(blueprintId, message.getPayload(), session);
            }

        } catch (Exception e) {
            log.error("Error handling WS message", e);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String blueprintId = sessionBlueprintMap.remove(session.getId());
        String userId = getQueryParam(session, "userId");

        if (blueprintId != null && userId != null) {
            roomManager.removeSession(blueprintId, userId, session);

            WSMessage<String> leaveMsg = WSMessage.<String>builder()
                    .type(WSMessageType.USER_LEAVE.getValue())
                    .payload(userId)
                    .senderId(userId)
                    .timestamp(System.currentTimeMillis())
                    .blueprintId(blueprintId)
                    .build();

            try {
                roomManager.broadcast(blueprintId, objectMapper.writeValueAsString(leaveMsg), null);
            } catch (IOException e) {
                log.error("Error broadcasting leave message", e);
            }
        }

        log.info("WebSocket closed: session={}, status={}", session.getId(), status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("WebSocket transport error for session={}", session.getId(), exception);
    }

    private String getQueryParam(WebSocketSession session, String name) {
        String query = session.getUri().getQuery();
        if (query == null) return null;
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2 && kv[0].equals(name)) {
                return kv[1];
            }
        }
        return null;
    }
}
