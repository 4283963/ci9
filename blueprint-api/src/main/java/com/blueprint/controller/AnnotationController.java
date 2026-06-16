package com.blueprint.controller;

import com.blueprint.entity.Annotation;
import com.blueprint.service.AnnotationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/annotations")
public class AnnotationController {

    private final AnnotationService annotationService;

    public AnnotationController(AnnotationService annotationService) {
        this.annotationService = annotationService;
    }

    @GetMapping
    public ResponseEntity<List<Annotation>> getAnnotations(
            @RequestParam String blueprintId,
            @RequestParam(required = false) Double minX,
            @RequestParam(required = false) Double minY,
            @RequestParam(required = false) Double maxX,
            @RequestParam(required = false) Double maxY) {

        List<Annotation> annotations;

        if (minX != null && minY != null && maxX != null && maxY != null) {
            annotations = annotationService.getAnnotationsByBounds(
                    blueprintId, minX, minY, maxX, maxY);
        } else {
            annotations = annotationService.getAnnotationsByBlueprint(blueprintId);
        }

        return ResponseEntity.ok(annotations);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Annotation> getAnnotation(@PathVariable String id) {
        return annotationService.getAnnotation(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Annotation> createAnnotation(@RequestBody Annotation annotation) {
        Annotation created = annotationService.createAnnotation(annotation);
        return ResponseEntity.ok(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Annotation> updateAnnotation(
            @PathVariable String id,
            @RequestBody Annotation annotation) {
        annotation.setId(id);
        Annotation updated = annotationService.updateAnnotation(annotation);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteAnnotation(@PathVariable String id) {
        annotationService.deleteAnnotation(id);
        return ResponseEntity.ok().build();
    }
}
