package com.blueprint.controller;

import com.blueprint.service.VoiceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

@Slf4j
@RestController
@RequestMapping("/api/voices")
public class VoiceController {

    private final VoiceService voiceService;

    public VoiceController(VoiceService voiceService) {
        this.voiceService = voiceService;
    }

    @PostMapping("/upload")
    public ResponseEntity<?> upload(
            @RequestParam String blueprintId,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String userName,
            @RequestParam(required = false) String color,
            @RequestParam(required = false) Double posX,
            @RequestParam(required = false) Double posY,
            @RequestParam(required = false) Double radius,
            @RequestParam(required = false) Integer duration,
            @RequestParam("file") MultipartFile file) {

        try {
            VoiceService.UploadResult res = voiceService.upload(
                    blueprintId, userId, userName, color, posX, posY, radius, duration, file);
            return ResponseEntity.ok(Map.of(
                    "id", res.id(),
                    "url", res.url(),
                    "duration", res.duration(),
                    "size", res.size()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            log.error("Failed to store voice file for blueprint {}", blueprintId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to store voice file"));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Resource> getVoice(@PathVariable String id) throws IOException {
        Optional<Path> pathOpt = voiceService.resolvePath(id);
        if (pathOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        Path path = pathOpt.get();

        String mime = voiceService.getMimeType(id).orElse("audio/webm");
        Resource resource = new FileSystemResource(path.toFile());
        long size = Files.size(path);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + path.getFileName() + "\"")
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentLength(size)
                .contentType(MediaType.parseMediaType(mime))
                .body(resource);
    }

    @GetMapping("/{id}/meta")
    public ResponseEntity<?> getMeta(@PathVariable String id) {
        return voiceService.findById(id)
                .<ResponseEntity<?>>map(v -> ResponseEntity.ok(Map.of(
                        "id", v.getId(),
                        "blueprintId", v.getBlueprintId(),
                        "duration", v.getDuration(),
                        "size", v.getSizeBytes(),
                        "mimeType", v.getMimeType(),
                        "createdAt", v.getCreatedAt(),
                        "userName", v.getUserName()
                )))
                .orElse(ResponseEntity.notFound().build());
    }
}
