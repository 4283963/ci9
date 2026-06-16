package com.blueprint.websocket;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CollaborativeUser {

    private String id;
    private String name;
    private String color;
    private Double cursorX;
    private Double cursorY;
    private long lastActive;
}
