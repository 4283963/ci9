package com.blueprint.service;

import com.blueprint.entity.Annotation;
import com.blueprint.repository.AnnotationRepository;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Slf4j
@Service
public class AnnotationService {

    private final AnnotationRepository annotationRepository;
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 3857);

    public AnnotationService(AnnotationRepository annotationRepository) {
        this.annotationRepository = annotationRepository;
    }

    @Transactional(readOnly = true)
    public List<Annotation> getAnnotationsByBlueprint(String blueprintId) {
        return annotationRepository.findByBlueprintIdOrderByCreatedAtAsc(blueprintId);
    }

    @Transactional(readOnly = true)
    public List<Annotation> getAnnotationsByBounds(String blueprintId,
                                                   double minX, double minY,
                                                   double maxX, double maxY) {
        Coordinate[] coords = {
                new Coordinate(minX, minY),
                new Coordinate(maxX, minY),
                new Coordinate(maxX, maxY),
                new Coordinate(minX, maxY),
                new Coordinate(minX, minY)
        };
        Polygon bounds = geometryFactory.createPolygon(coords);
        return annotationRepository.findByBlueprintIdAndBounds(blueprintId, bounds);
    }

    @Transactional
    public Annotation createAnnotation(Annotation annotation) {
        return annotationRepository.save(annotation);
    }

    @Transactional
    public Annotation updateAnnotation(Annotation annotation) {
        return annotationRepository.save(annotation);
    }

    @Transactional
    public void deleteAnnotation(String id) {
        annotationRepository.deleteById(id);
    }

    @Transactional(readOnly = true)
    public Optional<Annotation> getAnnotation(String id) {
        return annotationRepository.findById(id);
    }
}
