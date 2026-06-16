package com.blueprint.repository;

import com.blueprint.entity.Annotation;
import org.locationtech.jts.geom.Geometry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AnnotationRepository extends JpaRepository<Annotation, String> {

    List<Annotation> findByBlueprintIdOrderByCreatedAtAsc(String blueprintId);

    @Query("SELECT a FROM Annotation a WHERE a.blueprintId = :blueprintId " +
           "AND st_intersects(a.geom, :bounds) = true")
    List<Annotation> findByBlueprintIdAndBounds(
            @Param("blueprintId") String blueprintId,
            @Param("bounds") Geometry bounds);

    @Query("SELECT a FROM Annotation a WHERE a.blueprintId = :blueprintId " +
           "AND st_within(a.geom, :bounds) = true")
    List<Annotation> findWithinBounds(
            @Param("blueprintId") String blueprintId,
            @Param("bounds") Geometry bounds);
}
