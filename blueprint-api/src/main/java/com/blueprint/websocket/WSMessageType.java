package com.blueprint.websocket;

public enum WSMessageType {
    ANNOTATION_CREATE("annotation:create"),
    ANNOTATION_UPDATE("annotation:update"),
    ANNOTATION_DELETE("annotation:delete"),
    CURSOR_MOVE("cursor:move"),
    USER_JOIN("user:join"),
    USER_LEAVE("user:leave"),
    SYNC_REQUEST("sync:request"),
    SYNC_RESPONSE("sync:response");

    private final String value;

    WSMessageType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static WSMessageType fromValue(String value) {
        for (WSMessageType type : values()) {
            if (type.value.equals(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown message type: " + value);
    }
}
