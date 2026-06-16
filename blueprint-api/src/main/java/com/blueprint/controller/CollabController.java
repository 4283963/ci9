package com.blueprint.controller;

import com.blueprint.websocket.CollabRoomManager;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/collab")
public class CollabController {

    private final CollabRoomManager roomManager;

    public CollabController(CollabRoomManager roomManager) {
        this.roomManager = roomManager;
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        return ResponseEntity.ok(Map.of(
                "activeRooms", roomManager.getActiveRoomsCount(),
                "totalUsers", roomManager.getTotalUsers(),
                "rooms", roomManager.getRoomUsers().keySet()
        ));
    }
}
