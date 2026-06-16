package com.blueprint.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Data
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "voice_annotations", indexes = {
    @Index(name = "idx_voice_blueprint", columnList = "blueprintId"),
    @Index(name = "idx_voice_created", columnList = "createdAt")
})
public class VoiceAnnotation {

    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, length = 64)
    private String blueprintId;

    @Column(nullable = false, length = 64)
    private String userId;

    @Column(length = 64)
    private String userName;

    @Column(length = 16)
    private String color;

    @Column(columnDefinition = "geometry(Point, 3857)")
    private org.locationtech.jts.geom.Point geom;

    @JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private java.util.Map<String, Object> position;

    private Double radius;

    @Column(nullable = false, length = 512)
    private String storagePath;

    @Column(length = 512)
    private String accessUrl;

    @Column(length = 64)
    private String mimeType;

    @Column(nullable = false)
    private Integer duration;

    private Long sizeBytes;

    @Column(columnDefinition = "text")
    private String transcript;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
