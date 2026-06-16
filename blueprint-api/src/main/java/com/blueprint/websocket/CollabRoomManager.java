package com.blueprint.websocket;

import com.blueprint.entity.Annotation;
import com.blueprint.entity.AnnotationTool;
import com.blueprint.repository.AnnotationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.*;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class CollabRoomManager {

    private final Map<String, Map<String, WebSocketSession>> rooms = new ConcurrentHashMap<>();
    private final Map<String, Map<String, CollaborativeUser>> roomUsers = new ConcurrentHashMap<>();
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 3857);
    private final ObjectMapper objectMapper;

    private final AnnotationRepository annotationRepository;

    public CollabRoomManager(AnnotationRepository annotationRepository) {
        this.annotationRepository = annotationRepository;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
    }

    public void addSession(String blueprintId, String userId, WebSocketSession session) {
        rooms.computeIfAbsent(blueprintId, k -> new ConcurrentHashMap<>())
             .put(userId, session);

        CollaborativeUser user = CollaborativeUser.builder()
                .id(userId)
                .name("用户" + userId.substring(0, Math.min(6, userId.length())))
                .color("#007aff")
                .lastActive(System.currentTimeMillis())
                .build();

        roomUsers.computeIfAbsent(blueprintId, k -> new ConcurrentHashMap<>())
                .put(userId, user);
    }

    public void removeSession(String blueprintId, String userId, WebSocketSession session) {
        Map<String, WebSocketSession> room = rooms.get(blueprintId);
        if (room != null) {
            room.remove(userId);
            if (room.isEmpty()) {
                rooms.remove(blueprintId);
            }
        }

        Map<String, CollaborativeUser> users = roomUsers.get(blueprintId);
        if (users != null) {
            users.remove(userId);
            if (users.isEmpty()) {
                roomUsers.remove(blueprintId);
            }
        }
    }

    public void broadcast(String blueprintId, String message, WebSocketSession excludeSession) {
        Map<String, WebSocketSession> room = rooms.get(blueprintId);
        if (room == null || room.isEmpty()) return;

        TextMessage textMessage = new TextMessage(message);

        for (Map.Entry<String, WebSocketSession> entry : room.entrySet()) {
            WebSocketSession session = entry.getValue();
            if (excludeSession != null && session.getId().equals(excludeSession.getId())) {
                continue;
            }
            if (session.isOpen()) {
                try {
                    session.sendMessage(textMessage);
                } catch (IOException e) {
                    log.warn("Failed to send message to session {}", session.getId(), e);
                }
            }
        }
    }

    public void handleSyncRequest(String blueprintId, WebSocketSession session) throws IOException {
        List<Annotation> annotations = annotationRepository
                .findByBlueprintIdOrderByCreatedAtAsc(blueprintId);

        Map<String, CollaborativeUser> users = roomUsers.getOrDefault(blueprintId, Collections.emptyMap());

        Map<String, Object> payload = new HashMap<>();
        payload.put("annotations", annotations);
        payload.put("users", new ArrayList<>(users.values()));

        WSMessage<Map<String, Object>> response = WSMessage.<Map<String, Object>>builder()
                .type(WSMessageType.SYNC_RESPONSE.getValue())
                .payload(payload)
                .senderId("system")
                .timestamp(System.currentTimeMillis())
                .blueprintId(blueprintId)
                .build();

        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(response)));
    }

    public void persistAnnotation(WSMessage<?> msg) {
        try {
            WSMessageType type = WSMessageType.fromValue(msg.getType());
            if (type != WSMessageType.ANNOTATION_CREATE
                && type != WSMessageType.ANNOTATION_UPDATE
                && type != WSMessageType.ANNOTATION_DELETE) {
                return;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> payload = (Map<String, Object>) msg.getPayload();

            if (type == WSMessageType.ANNOTATION_DELETE) {
                String id = (String) payload.get("id");
                annotationRepository.deleteById(id);
                return;
            }

            Annotation annotation = convertToEntity(payload);
            annotationRepository.save(annotation);

        } catch (Exception e) {
            log.error("Error persisting annotation", e);
        }
    }

    @SuppressWarnings("unchecked")
    private Annotation convertToEntity(Map<String, Object> payload) {
        String toolStr = (String) payload.get("tool");
        AnnotationTool tool = AnnotationTool.valueOf(toolStr.toUpperCase());

        Annotation.AnnotationBuilder builder = Annotation.builder()
                .id((String) payload.get("id"))
                .blueprintId((String) payload.get("blueprintId"))
                .userId((String) payload.get("userId"))
                .userName((String) payload.get("userName"))
                .color((String) payload.get("color"))
                .tool(tool);

        switch (tool) {
            case PEN -> {
                List<Map<String, Double>> points = (List<Map<String, Double>>) payload.get("points");
                builder.points(points);
                if (points != null && points.size() >= 2) {
                    Coordinate[] coords = points.stream()
                            .map(p -> new Coordinate(p.get("x"), p.get("y")))
                            .toArray(Coordinate[]::new);
                    builder.geom(geometryFactory.createLineString(coords));
                }
            }
            case RECT -> {
                Map<String, Double> rect = (Map<String, Double>) payload.get("rect");
                builder.rect(rect);
                if (rect != null) {
                    double x = rect.get("x");
                    double y = rect.get("y");
                    double w = rect.get("width");
                    double h = rect.get("height");
                    Coordinate[] coords = {
                            new Coordinate(x, y),
                            new Coordinate(x + w, y),
                            new Coordinate(x + w, y + h),
                            new Coordinate(x, y + h),
                            new Coordinate(x, y)
                    };
                    builder.geom(geometryFactory.createPolygon(coords));
                }
            }
            case CIRCLE -> {
                Map<String, Object> center = (Map<String, Object>) payload.get("center");
                Number radius = (Number) payload.get("radius");
                builder.center(center);
                builder.radius(radius.doubleValue());
                if (center != null) {
                    double cx = ((Number) center.get("x")).doubleValue();
                    double cy = ((Number) center.get("y")).doubleValue();
                    builder.geom(geometryFactory.createPoint(new Coordinate(cx, cy)));
                }
            }
            case TEXT -> {
                Map<String, Object> position = (Map<String, Object>) payload.get("position");
                String text = (String) payload.get("text");
                builder.position(position);
                builder.textContent(text);
                if (position != null) {
                    double px = ((Number) position.get("x")).doubleValue();
                    double py = ((Number) position.get("y")).doubleValue();
                    builder.geom(geometryFactory.createPoint(new Coordinate(px, py)));
                }
            }
            default -> { }
        }

        return builder.build();
    }

    public Map<String, Map<String, CollaborativeUser>> getRoomUsers() {
        return roomUsers;
    }

    public int getActiveRoomsCount() {
        return rooms.size();
    }

    public int getTotalUsers() {
        return roomUsers.values().stream().mapToInt(Map::size).sum();
    }
}
