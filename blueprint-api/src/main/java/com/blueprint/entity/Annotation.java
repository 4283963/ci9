package com.blueprint.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Entity
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "annotations", indexes = {
    @Index(name = "idx_annotations_blueprint", columnList = "blueprintId"),
    @Index(name = "idx_annotations_geom", columnList = "geom")
})
public class Annotation {

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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AnnotationTool tool;

    @Column(columnDefinition = "geometry(Geometry, 3857)")
    private Geometry geom;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<Map<String, Double>> points;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Double> rect;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> center;

    private Double radius;

    @Column(columnDefinition = "text")
    private String textContent;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> position;

    @Column(length = 512)
    private String voiceUrl;

    private Integer duration;

    @Column(length = 255)
    private String voiceId;

    @Column(columnDefinition = "text")
    private String transcript;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
