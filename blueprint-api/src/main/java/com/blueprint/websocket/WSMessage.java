package com.blueprint.websocket;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WSMessage<T> {

    private String type;
    private T payload;
    private String senderId;
    private long timestamp;
    private String blueprintId;
}
