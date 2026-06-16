package com.blueprint.config;

import com.blueprint.websocket.CollabWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final CollabWebSocketHandler collabWebSocketHandler;

    public WebSocketConfig(CollabWebSocketHandler collabWebSocketHandler) {
        this.collabWebSocketHandler = collabWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(collabWebSocketHandler, "/ws/collab")
                .setAllowedOrigins("*");
    }
}
