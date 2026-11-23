package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.PilotAvatar;
import app.wingtipmaps.gateway.repository.PilotAvatarRepository;
import java.io.Serial;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The pilot's own photo for their avatar (the owner, 2026-11-20: "Yes to
 * choose photo"): a phone's own profile picture cannot be read by a web
 * page or an app, so the pilot picks one from Photos or their files and
 * the app sends it here scaled down and cropped square.
 *
 * <p>Kept small and only as what it says it is: a JPEG, PNG or WebP of at
 * most {@link #MAX_BYTES}, its first bytes the type's own signature, so
 * what is served back as an image is one. It is served only to its own
 * pilot (AvatarController), at an address that carries its version, so a
 * new photo is never an old one from a cache. It goes with the account,
 * by the database's cascade (V45), and comes with the account's export.
 */
@Service
public class AvatarService {

    /** The app sends about 256 pixels square as a JPEG, some 20-40 KB;
     *  this leaves room for a PNG or a client that does not scale. */
    public static final int MAX_BYTES = 512 * 1024;

    /** Where the app reads the photo from; its version follows. */
    static final String PATH = "/api/me/avatar";

    private final PilotAvatarRepository avatars;

    public AvatarService(PilotAvatarRepository avatars) {
        this.avatars = avatars;
    }

    /** The photo's address with its version, or null when the pilot has
     *  none: read with the pilot (Pilot.avatarUpdatedAt), never its bytes. */
    public static @Nullable String url(Pilot pilot) {
        Instant at = pilot.getAvatarUpdatedAt();
        return at == null ? null : PATH + "?v=" + at.toEpochMilli();
    }

    @Transactional(readOnly = true)
    public Optional<Photo> photo(Pilot pilot) {
        return avatars.findById(pilot.getId()).map(a -> new Photo(a.getContentType(), a.getImage()));
    }

    /** The photo as a data: URL, for the account's export; null when none. */
    @Transactional(readOnly = true)
    public @Nullable String dataUrl(Pilot pilot) {
        return photo(pilot)
                .map(p -> "data:" + p.contentType() + ";base64,"
                        + Base64.getEncoder().encodeToString(p.bytes()))
                .orElse(null);
    }

    /**
     * Keeps the pilot's photo in place of any before it.
     *
     * @throws AvatarRejectedException for an empty or too large file, or
     *     one that is not the JPEG, PNG or WebP it says it is
     */
    @Transactional
    public void save(Pilot pilot, @Nullable String contentType, byte[] bytes) {
        if (bytes.length == 0) {
            throw new AvatarRejectedException(HttpStatus.BAD_REQUEST, "The photo was empty.");
        }
        if (bytes.length > MAX_BYTES) {
            throw new AvatarRejectedException(
                    HttpStatus.CONTENT_TOO_LARGE, "The photo is too large: at most " + MAX_BYTES / 1024 + " KB.");
        }
        String type = contentType == null ? "" : contentType;
        if (!isImage(type, bytes)) {
            throw new AvatarRejectedException(
                    HttpStatus.UNSUPPORTED_MEDIA_TYPE, "A photo is a JPEG, PNG or WebP image.");
        }
        PilotAvatar avatar = avatars.findById(pilot.getId())
                .map(a -> {
                    a.replace(type, bytes);
                    return a;
                })
                .orElseGet(() -> new PilotAvatar(pilot.getId(), type, bytes));
        avatars.save(avatar);
    }

    /** Whether the pilot had a photo to take away. */
    @Transactional
    public boolean delete(Pilot pilot) {
        if (!avatars.existsById(pilot.getId())) {
            return false;
        }
        avatars.deleteById(pilot.getId());
        return true;
    }

    /** Whether the bytes begin as the type they are sent as does: JPEG's
     *  SOI marker, PNG's eight-byte signature, WebP's RIFF....WEBP. */
    static boolean isImage(String type, byte[] b) {
        return switch (type) {
            case "image/jpeg" -> starts(b, 0, new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF});
            case "image/png" -> starts(b, 0, new byte[] {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'});
            case "image/webp" -> starts(b, 0, ascii("RIFF")) && starts(b, 8, ascii("WEBP"));
            default -> false;
        };
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.US_ASCII);
    }

    private static boolean starts(byte[] bytes, int at, byte[] prefix) {
        return bytes.length >= at + prefix.length
                && Arrays.equals(bytes, at, at + prefix.length, prefix, 0, prefix.length);
    }

    /** A photo's type and bytes, as kept. */
    public record Photo(String contentType, byte[] bytes) {}

    /** A photo not kept, and why, with the status to answer. */
    public static class AvatarRejectedException extends RuntimeException {
        @Serial
        private static final long serialVersionUID = 1L;

        private final HttpStatus status;

        AvatarRejectedException(HttpStatus status, String why) {
            super(why);
            this.status = status;
        }

        public HttpStatus status() {
            return status;
        }
    }
}
