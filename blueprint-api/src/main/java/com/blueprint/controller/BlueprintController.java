package com.blueprint.controller;

import com.blueprint.entity.Blueprint;
import com.blueprint.service.BlueprintService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/api")
public class BlueprintController {

    private final BlueprintService blueprintService;

    public BlueprintController(BlueprintService blueprintService) {
        this.blueprintService = blueprintService;
    }

    @GetMapping("/blueprints/{id}")
    public ResponseEntity<Blueprint> getBlueprint(@PathVariable String id) {
        return blueprintService.getBlueprint(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/tiles/{blueprintId}/{z}/{x}/{y}.png")
    public ResponseEntity<Resource> getTile(
            @PathVariable String blueprintId,
            @PathVariable int z,
            @PathVariable int x,
            @PathVariable int y) throws IOException {

        Path tilePath = blueprintService.getTilePath(blueprintId, z, x, y);

        if (!Files.exists(tilePath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(tilePath);
        String contentType = Files.probeContentType(tilePath);
        if (contentType == null) {
            contentType = "image/png";
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .contentType(MediaType.parseMediaType(contentType))
                .body(resource);
    }

    @PostMapping("/blueprints/upload")
    public ResponseEntity<Blueprint> uploadBlueprint(
            @RequestParam String name,
            @RequestParam("file") MultipartFile file) throws IOException {

        Blueprint blueprint = blueprintService.uploadAndSlice(name, file);
        return ResponseEntity.ok(blueprint);
    }
}
