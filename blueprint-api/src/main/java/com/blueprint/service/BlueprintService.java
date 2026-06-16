package com.blueprint.service;

import com.blueprint.entity.Blueprint;
import com.blueprint.repository.BlueprintRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
public class BlueprintService {

    private final BlueprintRepository blueprintRepository;

    @Value("${blueprint.tile.storage-path:/var/blueprint/tiles}")
    private String storagePath;

    @Value("${blueprint.tile.tile-size:256}")
    private int tileSize;

    @Value("${blueprint.tile.max-zoom:6}")
    private int maxZoom;

    public BlueprintService(BlueprintRepository blueprintRepository) {
        this.blueprintRepository = blueprintRepository;
    }

    public Optional<Blueprint> getBlueprint(String id) {
        return blueprintRepository.findById(id);
    }

    public Path getTilePath(String blueprintId, int z, int x, int y) {
        return Paths.get(storagePath, blueprintId, String.valueOf(z),
                String.valueOf(x), y + ".png");
    }

    public boolean tileExists(String blueprintId, int z, int x, int y) {
        return Files.exists(getTilePath(blueprintId, z, x, y));
    }

    public Blueprint uploadAndSlice(String name, MultipartFile file) throws IOException {
        String id = "bp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        BufferedImage original = ImageIO.read(file.getInputStream());
        int width = original.getWidth();
        int height = original.getHeight();

        Path blueprintDir = Paths.get(storagePath, id);
        Files.createDirectories(blueprintDir);

        for (int z = 0; z <= maxZoom; z++) {
            double scale = Math.pow(2, z);
            int scaledWidth = (int) Math.ceil(width * scale / tileSize) * tileSize;
            int scaledHeight = (int) Math.ceil(height * scale / tileSize) * tileSize;
            int tilesX = (int) Math.ceil((double) width * scale / tileSize);
            int tilesY = (int) Math.ceil((double) height * scale / tileSize);

            BufferedImage scaled = new BufferedImage(scaledWidth, scaledHeight, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g2d = scaled.createGraphics();
            g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g2d.drawImage(original, 0, 0, (int) (width * scale), (int) (height * scale), null);
            g2d.dispose();

            for (int x = 0; x < tilesX; x++) {
                Path tileDir = Paths.get(storagePath, id, String.valueOf(z), String.valueOf(x));
                Files.createDirectories(tileDir);

                for (int y = 0; y < tilesY; y++) {
                    int sx = x * tileSize;
                    int sy = y * tileSize;
                    int sw = Math.min(tileSize, scaledWidth - sx);
                    int sh = Math.min(tileSize, scaledHeight - sy);

                    BufferedImage tile = scaled.getSubimage(sx, sy, sw, sh);
                    File tileFile = tileDir.resolve(y + ".png").toFile();
                    ImageIO.write(tile, "PNG", tileFile);
                }
            }
        }

        Blueprint blueprint = Blueprint.builder()
                .id(id)
                .name(name)
                .width(width)
                .height(height)
                .originalFileName(file.getOriginalFilename())
                .tileStoragePath(blueprintDir.toString())
                .maxZoom(maxZoom)
                .tileSize(tileSize)
                .build();

        return blueprintRepository.save(blueprint);
    }

    public int getMaxZoom() {
        return maxZoom;
    }

    public int getTileSize() {
        return tileSize;
    }
}
