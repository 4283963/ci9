package com.blueprint.repository;

import com.blueprint.entity.VoiceAnnotation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VoiceAnnotationRepository extends JpaRepository<VoiceAnnotation, String> {

    List<VoiceAnnotation> findByBlueprintIdOrderByCreatedAtAsc(String blueprintId);
}
