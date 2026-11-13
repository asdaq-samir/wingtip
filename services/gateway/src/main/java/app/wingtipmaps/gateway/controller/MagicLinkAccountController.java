package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Whose account an emailed sign-in link signs in to, asked before it is
 * used: the web's sign-in dialog (LinkSignIn) and the phone apps' sheet
 * name it, so a pilot sent a link to someone else's account -- an
 * attacker's, to collect what the pilot then saves -- sees whose it is
 * and does not press Sign in (the security audit's L1 and M1, 2026-11-10).
 *
 * <p>The address masked (its first letter and its domain), and only for a
 * link that could still sign in: a used, expired or unknown token answers
 * a bare 404, all three alike. Nothing is spent: the token still signs in
 * once, by POST /verify. No enumeration: a token is 32 random bytes, so
 * nobody can guess one, and the answer is the address of a link whoever
 * holds it could sign in with anyway. Held to so many asks an hour from an
 * address (app.magic-link.account-per-client-per-hour, 30) all the same.
 * A POST, with the token in the body, so it is in no URL or log.
 */
@RestController
@RequestMapping("/api/auth/magic-link/account")
public class MagicLinkAccountController {

    private final MagicLinkRepository magicLinks;
    private final int perClientPerHour;
    private final SlidingWindowLimiter recent = new SlidingWindowLimiter(Duration.ofHours(1));

    public MagicLinkAccountController(MagicLinkRepository magicLinks, AppProperties app) {
        int perClientPerHour = app.magicLink().accountPerClientPerHour();
        this.magicLinks = magicLinks;
        this.perClientPerHour = perClientPerHour;
    }

    /** The account a link signs in to, its address masked. */
    public record LinkAccount(String email) {}

    @Operation(
            summary = "Whose account a sign-in link is for",
            description = "The masked address (a•••@icloud.com) a usable magic-link token signs in to, without "
                    + "using it; 404 for a used, expired or unknown token, alike; 429 past the hour's limit.")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description = "The link's account, masked",
                content = @Content(schema = @Schema(implementation = LinkAccount.class))),
        @ApiResponse(responseCode = "404", description = "No usable link with that token"),
        @ApiResponse(responseCode = "429", description = "Too many asks from this address this hour")
    })
    @PostMapping(consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<LinkAccount> account(@RequestParam String token, HttpServletRequest request) {
        Instant now = Instant.now();
        if (!recent.allow("client:" + SlidingWindowLimiter.clientOf(request), perClientPerHour, now)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        return magicLinks
                .findByTokenHash(MagicLinkController.hash(token))
                .filter(link ->
                        link.getConsumedAt() == null && link.getExpiresAt().isAfter(now))
                .map(link -> ResponseEntity.ok(new LinkAccount(masked(link.getEmail()))))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** "alice@icloud.com" as "a•••@icloud.com": enough for the pilot to
     *  tell their own address from another, not the address itself. */
    static String masked(String email) {
        int at = email.lastIndexOf('@');
        if (at <= 0) {
            return "•••";
        }
        return email.charAt(0) + "•••" + email.substring(at);
    }
}
