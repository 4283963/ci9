package com.blueprint.websocket;

import com.blueprint.entity.Annotation;
import com.blueprint.entity.AnnotationTool;
import com.blueprint.repository.AnnotationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.*;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
public class CollabRoomManager {

    private final ConcurrentHashMap<String, ConcurrentHashMap<String, WebSocketSession>> rooms =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ConcurrentHashMap<String, CollaborativeUser>> roomUsers =
            new ConcurrentHashMap<>();
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 3857);
    private final ObjectMapper objectMapper;
    private final AnnotationRepository annotationRepository;

    private final ExecutorService broadcastExecutor;
    private final ExecutorService persistExecutor;
    private final ConcurrentHashMap.KeySetView<String, Boolean> persistInflightIds =
            ConcurrentHashMap.newKeySet();

    public CollabRoomManager(AnnotationRepository annotationRepository, ObjectMapper objectMapper) {
        this.annotationRepository = annotationRepository;
        this.objectMapper = objectMapper;

        this.broadcastExecutor = new ThreadPoolExecutor(
                2, 8, 60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(10000),
                new NamedThreadFactory("ws-broadcast-"),
                new ThreadPoolExecutor.CallerRunsPolicy()
        );

        this.persistExecutor = new ThreadPoolExecutor(
                1, 4, 60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(20000),
                new NamedThreadFactory("ws-persist-"),
                new ThreadPoolExecutor.DiscardOldestPolicy()
        );
    }

    public void addSession(String blueprintId, String userId, WebSocketSession session) {
        rooms.compute(blueprintId, (k, existingRoom) -> {
            ConcurrentHashMap<String, WebSocketSession> room =
                    existingRoom != null ? existingRoom : new ConcurrentHashMap<>();
            room.put(userId, session);
            return room;
        });

        CollaborativeUser user = CollaborativeUser.builder()
                .id(userId)
                .name("用户" + userId.substring(0, Math.min(6, userId.length())))
                .color("#007aff")
                .lastActive(System.currentTimeMillis())
                .build();

        roomUsers.compute(blueprintId, (k, existingMap) -> {
            ConcurrentHashMap<String, CollaborativeUser> userMap =
                    existingMap != null ? existingMap : new ConcurrentHashMap<>();
            userMap.put(userId, user);
            return userMap;
        });
    }

    public void removeSession(String blueprintId, String userId, WebSocketSession session) {
        rooms.computeIfPresent(blueprintId, (k, room) -> {
            room.remove(userId);
            return room.isEmpty() ? null : room;
        });

        roomUsers.computeIfPresent(blueprintId, (k, users) -> {
            users.remove(userId);
            return users.isEmpty() ? null : users;
        });
    }

    public void broadcast(String blueprintId, String message, WebSocketSession excludeSession) {
        ConcurrentHashMap<String, WebSocketSession> room = rooms.get(blueprintId);
        if (room == null || room.isEmpty()) return;

        String excludeId = excludeSession != null ? excludeSession.getId() : null;
        TextMessage textMessage = new TextMessage(message);

        List<WebSocketSession> snapshot;
        try {
            snapshot = new ArrayList<>(room.values());
        } catch (Exception e) {
            log.warn("Failed to create room snapshot for {}", blueprintId, e);
            return;
        }

        broadcastExecutor.submit(() -> doBroadcast(snapshot, excludeId, textMessage, blueprintId));
    }

    private void doBroadcast(List<WebSocketSession> sessions,
                             String excludeId,
                             TextMessage textMessage,
                             String blueprintId) {
        for (WebSocketSession session : sessions) {
            if (session == null || !session.isOpen()) continue;
            if (excludeId != null && excludeId.equals(session.getId())) continue;

            try {
                session.sendMessage(textMessage);
            } catch (IllegalStateException e) {
                log.debug("Session {} already closed, skipping", session.getId());
                safeRemoveBySession(blueprintId, session);
            } catch (IOException e) {
                log.warn("IO error sending to session {} ({}), will remove",
                        session.getId(), e.getMessage());
                safeRemoveBySession(blueprintId, session);
                closeQuietly(session);
            } catch (Exception e) {
                log.error("Unexpected error broadcasting to session {}", session.getId(), e);
            }
        }
    }

    private void safeRemoveBySession(String blueprintId, WebSocketSession session) {
        try {
            ConcurrentHashMap<String, WebSocketSession> room = rooms.get(blueprintId);
            if (room == null) return;
            room.values().removeIf(s -> s != null && s.getId().equals(session.getId()));
        } catch (Exception ignored) {
        }
    }

    private static void closeQuietly(WebSocketSession session) {
        try {
            if (session.isOpen()) session.close();
        } catch (Exception ignored) {
        }
    }

    public void handleSyncRequest(String blueprintId, WebSocketSession session) {
        if (session == null || !session.isOpen()) return;

        CompletableFuture.runAsync(() -> {
            try {
                List<Annotation> annotations = annotationRepository
                        .findByBlueprintIdOrderByCreatedAtAsc(blueprintId);

                ConcurrentHashMap<String, CollaborativeUser> usersMap = roomUsers.get(blueprintId);
                List<CollaborativeUser> usersSnapshot = usersMap != null
                        ? new ArrayList<>(usersMap.values())
                        : Collections.emptyList();

                Map<String, Object> payload = new HashMap<>();
                payload.put("annotations", annotations);
                payload.put("users", usersSnapshot);

                WSMessage<Map<String, Object>> response = WSMessage.<Map<String, Object>>builder()
                        .type(WSMessageType.SYNC_RESPONSE.getValue())
                        .payload(payload)
                        .senderId("system")
                        .timestamp(System.currentTimeMillis())
                        .blueprintId(blueprintId)
                        .build();

                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(objectMapper.writeValueAsString(response)));
                }
            } catch (Exception e) {
                log.error("Failed to handle sync request for blueprint {}", blueprintId, e);
            }
        }, broadcastExecutor);
    }

    public void persistAnnotation(WSMessage<?> msg) {
        persistExecutor.submit(() -> doPersistAnnotation(msg));
    }

    private void doPersistAnnotation(WSMessage<?> msg) {
        try {
            WSMessageType type = WSMessageType.fromValue(msg.getType());
            if (type != WSMessageType.ANNOTATION_CREATE
                    && type != WSMessageType.ANNOTATION_UPDATE
                    && type != WSMessageType.ANNOTATION_DELETE) {
                return;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> payload = (Map<String, Object>) msg.getPayload();

            String id = payload != null ? (String) payload.get("id") : null;
            if (id == null || id.isEmpty()) {
                log.warn("Annotation missing id, skipping persist");
                return;
            }

            String dedupKey = type.name() + ":" + id + ":" + msg.getTimestamp();
            if (!persistInflightIds.add(dedupKey)) {
                log.debug("Duplicate persist skipped for {}", dedupKey);
                return;
            }

            try {
                if (type == WSMessageType.ANNOTATION_DELETE) {
                    annotationRepository.deleteById(id);
                    return;
                }

                Annotation annotation = convertToEntity(payload);
                annotationRepository.save(annotation);
            } finally {
                persistInflightIds.remove(dedupKey);
            }

        } catch (Exception e) {
            log.error("Error persisting annotation", e);
        }
    }

    @SuppressWarnings("unchecked")
    private Annotation convertToEntity(Map<String, Object> payload) {
        String toolStr = (String) payload.get("tool");
        AnnotationTool tool;
        try {
            tool = AnnotationTool.valueOf(toolStr.toUpperCase());
        } catch (Exception e) {
            tool = AnnotationTool.PEN;
        }

        Annotation.AnnotationBuilder builder = Annotation.builder()
                .id((String) payload.get("id"))
                .blueprintId((String) payload.get("blueprintId"))
                .userId((String) payload.get("userId"))
                .userName(safeStr(payload.get("userName")))
                .color(safeStr(payload.get("color"), "#ff3b30"))
                .tool(tool);

        switch (tool) {
            case PEN -> {
                List<Map<String, Double>> points = (List<Map<String, Double>>) payload.get("points");
                builder.points(points);
                if (points != null && points.size() >= 2) {
                    Coordinate[] coords = points.stream()
                            .filter(Objects::nonNull)
                            .map(p -> {
                                double x = p.getOrDefault("x", 0d);
                                double y = p.getOrDefault("y", 0d);
                                return new Coordinate(x, y);
                            })
                            .toArray(Coordinate[]::new);
                    if (coords.length >= 2) {
                        builder.geom(geometryFactory.createLineString(coords));
                    }
                }
            }
            case RECT -> {
                Map<String, Double> rect = (Map<String, Double>) payload.get("rect");
                builder.rect(rect);
                if (rect != null) {
                    double x = rect.getOrDefault("x", 0d);
                    double y = rect.getOrDefault("y", 0d);
                    double w = rect.getOrDefault("width", 0d);
                    double h = rect.getOrDefault("height", 0d);
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
                builder.radius(radius != null ? radius.doubleValue() : 0d);
                if (center != null) {
                    double cx = ((Number) center.getOrDefault("x", 0)).doubleValue();
                    double cy = ((Number) center.getOrDefault("y", 0)).doubleValue();
                    builder.geom(geometryFactory.createPoint(new Coordinate(cx, cy)));
                }
            }
            case TEXT -> {
                Map<String, Object> position = (Map<String, Object>) payload.get("position");
                String text = (String) payload.get("text");
                builder.position(position);
                builder.textContent(text);
                if (position != null) {
                    double px = ((Number) position.getOrDefault("x", 0)).doubleValue();
                    double py = ((Number) position.getOrDefault("y", 0)).doubleValue();
                    builder.geom(geometryFactory.createPoint(new Coordinate(px, py)));
                }
            }
            default -> {
            }
        }

        return builder.build();
    }

    private static String safeStr(Object o) {
        return safeStr(o, null);
    }

    private static String safeStr(Object o, String def) {
        if (o instanceof String s) return s;
        return o != null ? o.toString() : def;
    }

    public Map<String, Map<String, CollaborativeUser>> getRoomUsers() {
        return Collections.unmodifiableMap(roomUsers);
    }

    public int getActiveRoomsCount() {
        return rooms.size();
    }

    public int getTotalUsers() {
        return roomUsers.values().stream().mapToInt(ConcurrentHashMap::size).sum();
    }

    @PreDestroy
    public void shutdown() {
        broadcastExecutor.shutdownNow();
        persistExecutor.shutdownNow();
        try {
            if (!broadcastExecutor.awaitTermination(2, TimeUnit.SECONDS)) {
                log.warn("Broadcast executor did not terminate cleanly");
            }
            if (!persistExecutor.awaitTermination(2, TimeUnit.SECONDS)) {
                log.warn("Persist executor did not terminate cleanly");
            }
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private static class NamedThreadFactory implements ThreadFactory {
        private final String prefix;
        private final AtomicInteger counter = new AtomicInteger(0);

        NamedThreadFactory(String prefix) {
            this.prefix = prefix;
        }

        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r, prefix + counter.incrementAndGet());
            t.setDaemon(true);
            t.setUncaughtExceptionHandler((thread, throwable) ->
                    log.error("Uncaught in thread {}", thread.getName(), throwable));
            return t;
        }
    }
}
