package com.blueprint.service;

import com.blueprint.entity.VoiceAnnotation;
import com.blueprint.repository.VoiceAnnotationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
public class VoiceService {

    private final VoiceAnnotationRepository voiceRepository;

    @Value("${blueprint.voice.storage-path:/var/blueprint/voices}")
    private String storagePath;

    @Value("${blueprint.voice.access-prefix:/api/voices}")
    private String accessPrefix;

    @Value("${blueprint.voice.max-size-mb:20}")
    private int maxSizeMb;

    @Value("${blueprint.voice.max-duration-sec:300}")
    private int maxDurationSec;

    private final org.locationtech.jts.geom.GeometryFactory geometryFactory =
            new org.locationtech.jts.geom.GeometryFactory(new org.locationtech.jts.geom.PrecisionModel(), 3857);

    public VoiceService(VoiceAnnotationRepository voiceRepository) {
        this.voiceRepository = voiceRepository;
    }

    @PostConstruct
    public void init() throws IOException {
        Path root = Paths.get(storagePath);
        if (!Files.exists(root)) {
            Files.createDirectories(root);
            log.info("Created voice storage directory: {}", root.toAbsolutePath());
        }
    }

    public record UploadResult(String id, String url, int duration, long size) {}

    public UploadResult upload(String blueprintId,
                               String userId,
                               String userName,
                               String color,
                               Double posX,
                               Double posY,
                               Double radius,
                               Integer duration,
                               MultipartFile file) throws IOException {

        if (file.isEmpty()) {
            throw new IllegalArgumentException("Voice file is empty");
        }

        long maxBytes = (long) maxSizeMb * 1024 * 1024;
        if (file.getSize() > maxBytes) {
            throw new IllegalArgumentException("Voice file exceeds max size " + maxSizeMb + "MB");
        }

        int dur = duration != null ? duration : 0;
        if (dur > maxDurationSec) {
            throw new IllegalArgumentException("Voice duration exceeds max " + maxDurationSec + "s");
        }

        String id = "v_" + UUID.randomUUID().toString().replace("-", "");
        String safeBpId = sanitize(blueprintId);
        Path bpDir = Paths.get(storagePath, safeBpId);
        Files.createDirectories(bpDir);

        String ext = guessExtension(file.getContentType(), file.getOriginalFilename());
        String fileName = id + ext;
        Path target = bpDir.resolve(fileName);
        Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

        String accessUrl = accessPrefix + "/" + id;

        org.locationtech.jts.geom.Point geom = null;
        if (posX != null && posY != null) {
            geom = geometryFactory.createPoint(new org.locationtech.jts.geom.Coordinate(posX, posY));
        }

        VoiceAnnotation voice = VoiceAnnotation.builder()
                .id(id)
                .blueprintId(blueprintId)
                .userId(userId != null ? userId : "anonymous")
                .userName(userName)
                .color(color != null && !color.isBlank() ? color : "#ff3b30")
                .position(posX != null && posY != null ? Map.of("x", posX, "y", posY) : null)
                .radius(radius != null ? radius : 60.0)
                .geom(geom)
                .storagePath(target.toAbsolutePath().toString())
                .accessUrl(accessUrl)
                .mimeType(file.getContentType())
                .duration(dur)
                .sizeBytes(file.getSize())
                .build();

        voiceRepository.save(voice);

        log.info("Stored voice: id={}, bp={}, user={}, size={}B, dur={}s",
                id, blueprintId, userId, file.getSize(), dur);

        return new UploadResult(id, accessUrl, dur, file.getSize());
    }

    public Optional<Path> resolvePath(String id) {
        Optional<VoiceAnnotation> opt = voiceRepository.findById(id);
        if (opt.isEmpty()) return Optional.empty();
        VoiceAnnotation v = opt.get();
        Path p = Paths.get(v.getStoragePath());
        if (!Files.exists(p)) return Optional.empty();
        return Optional.of(p);
    }

    public Optional<String> getMimeType(String id) {
        return voiceRepository.findById(id).map(v -> v.getMimeType() != null ? v.getMimeType() : "audio/webm");
    }

    public Optional<VoiceAnnotation> findById(String id) {
        return voiceRepository.findById(id);
    }

    private static String sanitize(String s) {
        if (s == null) return "unknown";
        return s.replaceAll("[^a-zA-Z0-9_\\-]", "_");
    }

    private static String guessExtension(String mime, String originalName) {
        if (originalName != null) {
            int dot = originalName.lastIndexOf('.');
            if (dot > 0 && dot < originalName.length() - 1) {
                String ext = originalName.substring(dot);
                if (ext.length() <= 6) return ext.toLowerCase();
            }
        }
        if (mime == null) return ".webm";
        String lower = mime.toLowerCase();
        if (lower.contains("webm")) return ".webm";
        if (lower.contains("ogg") || lower.contains("opus")) return ".ogg";
        if (lower.contains("mp4") || lower.contains("m4a")) return ".m4a";
        if (lower.contains("wav")) return ".wav";
        if (lower.contains("mp3")) return ".mp3";
        return ".webm";
    }
}
