package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.service.AvatarService;
import app.wingtipmaps.gateway.service.AvatarService.AvatarRejectedException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The pilot's own photo for their avatar (AvatarService): set from Pilot
 * Details' Choose Photo, shown wherever their initials were, taken out
 * with Remove Photo. Only ever their own: each call is the session's
 * pilot, and the photo's address (PilotDto.avatarUrl) names no one.
 */
@RestController
@Tag(name = "Pilot", description = "The signed-in pilot")
public class AvatarController {

    /** A photo's address changes with it (its ?v=), so what a browser
     *  keeps under one never goes stale; private, as it is the pilot's. */
    private static final CacheControl KEPT =
            CacheControl.maxAge(Duration.ofDays(365)).cachePrivate().immutable();

    private final AvatarService avatars;

    public AvatarController(AvatarService avatars) {
        this.avatars = avatars;
    }

    @Operation(
            summary = "The signed-in pilot's photo",
            description = "Their avatar's image, as they set it, at the address GET /api/me gives as avatarUrl "
                    + "(its v is the version, so a browser may keep it).")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "The image",
                content = {
                    @Content(mediaType = "image/jpeg", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/png", schema = @Schema(type = "string", format = "binary")),
                    @Content(mediaType = "image/webp", schema = @Schema(type = "string", format = "binary"))
                }),
        @ApiResponse(responseCode = "401", description = "No session", content = @Content),
        @ApiResponse(responseCode = "404", description = "They have set no photo", content = @Content)
    })
    @GetMapping("/api/me/avatar")
    public ResponseEntity<byte[]> avatar(
            Pilot pilot,
            @Parameter(description = "The photo's version, which only makes its address new")
                    @RequestParam(name = "v", required = false)
                    Long version) {
        return avatars.photo(pilot)
                .map(photo -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(photo.contentType()))
                        .cacheControl(KEPT)
                        .body(photo.bytes()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @Operation(
            summary = "Set the signed-in pilot's photo",
            description = "One image, as the form's photo: a JPEG, PNG or WebP of at most 512 KB (the app sends "
                    + "it about 256 pixels square). It takes the place of any before it.")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Kept; GET /api/me gives its new address"),
        @ApiResponse(responseCode = "400", description = "The photo was empty"),
        @ApiResponse(responseCode = "401", description = "No session"),
        @ApiResponse(responseCode = "413", description = "Over 512 KB"),
        @ApiResponse(responseCode = "415", description = "Not a JPEG, PNG or WebP image")
    })
    @PutMapping(path = "/api/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> setAvatar(Pilot pilot, @RequestPart("photo") MultipartFile photo) throws IOException {
        try {
            avatars.save(pilot, photo.getContentType(), photo.getBytes());
        } catch (AvatarRejectedException rejected) {
            return ResponseEntity.of(ProblemDetail.forStatusAndDetail(rejected.status(), rejected.getMessage()))
                    .build();
        }
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Take out the signed-in pilot's photo", description = "Their initials show again.")
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Taken out"),
        @ApiResponse(responseCode = "401", description = "No session"),
        @ApiResponse(responseCode = "404", description = "They had no photo")
    })
    @DeleteMapping("/api/me/avatar")
    public ResponseEntity<Void> removeAvatar(Pilot pilot) {
        return PilotResponses.done(avatars.delete(pilot));
    }
}
