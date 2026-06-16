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
@Table(name = "blueprints", indexes = {
    @Index(name = "idx_blueprints_name", columnList = "name")
})
public class Blueprint {

    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, length = 255)
    private String name;

    private Integer width;

    private Integer height;

    @Column(length = 128)
    private String originalFileName;

    @Column(length = 64)
    private String tileStoragePath;

    private Integer maxZoom;

    private Integer tileSize;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
