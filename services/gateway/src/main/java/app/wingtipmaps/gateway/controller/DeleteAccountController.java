package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.config.AppProperties;
import app.wingtipmaps.gateway.domain.MagicLink;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.service.AccountService;
import app.wingtipmaps.gateway.service.AccountService.AccountNotDeletedException;
import app.wingtipmaps.gateway.service.Mailer;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Deleting an account without the app, as Google Play requires of an app
 * that has accounts ("a web link where users can request account and data
 * deletion without reinstalling the app", Play Console Help 13327111): a
 * pilot who no longer has the app, or never signs in on the web, asks at
 * /delete-account with their address, is emailed a link, and confirms
 * there. It deletes exactly what Setup's Delete Account does
 * (AccountService.delete), so the two can never differ.
 *
 * <p>The link is a magic link (MagicLinkController's table and its
 * 15-minute, once-only rule), its hash taken over a purpose prefix so a
 * sign-in link cannot delete an account and a deletion link cannot sign
 * anyone in. Asking always answers the same, known address or not, so the
 * page tells nobody who has an account. Opening the link deletes nothing:
 * a mail scanner that fetches it would otherwise delete the account; the
 * pilot presses Delete on the page it opens. Thymeleaf's
 * templates/delete-account, no script, as /connect's are; not in the
 * API's document.
 */
@Controller
@Hidden
public class DeleteAccountController {

    private static final Logger log = LoggerFactory.getLogger(DeleteAccountController.class);
    private static final Duration LIFETIME = Duration.ofMinutes(15);
    private static final Duration THROTTLE_WINDOW = Duration.ofHours(1);
    /** Hashed with the token, so the row is good for deletion alone. */
    static final String PURPOSE = "delete-account:";

    private final MagicLinkRepository links;
    private final PilotRepository pilots;
    private final AccountService accounts;
    private final Mailer mailer;
    private final String publicBaseUrl;
    private final int perAddressPerHour;
    private final int perClientPerHour;
    /** Opening and pressing a link, per caller an hour, as MagicLinkAccountController holds its asks. */
    private final int linkChecksPerClientPerHour;

    private final SlidingWindowLimiter recent = new SlidingWindowLimiter(THROTTLE_WINDOW);
    private final SecureRandom random = new SecureRandom();

    public DeleteAccountController(
            MagicLinkRepository links,
            PilotRepository pilots,
            AccountService accounts,
            Mailer mailer,
            AppProperties app) {
        String publicBaseUrl = app.publicBaseUrl();
        int perAddressPerHour = app.magicLink().perAddressPerHour();
        int perClientPerHour = app.magicLink().perClientPerHour();
        int linkChecksPerClientPerHour = app.magicLink().accountPerClientPerHour();
        this.links = links;
        this.pilots = pilots;
        this.accounts = accounts;
        this.mailer = mailer;
        this.publicBaseUrl = publicBaseUrl.replaceAll("/+$", "");
        this.perAddressPerHour = perAddressPerHour;
        this.perClientPerHour = perClientPerHour;
        this.linkChecksPerClientPerHour = linkChecksPerClientPerHour;
    }

    /** The page that asks for the address. */
    @GetMapping("/delete-account")
    public String page(
            @RequestParam(required = false) String sent,
            @RequestParam(required = false) String throttled,
            Model model) {
        model.addAttribute(
                "notice",
                sent != null
                        ? "If an account uses that address, we emailed it a link. Open it within 15 minutes to delete the account."
                        : throttled != null ? "Too many links were asked for. Try again in an hour." : "");
        return "delete-account/ask";
    }

    /** The address given: a link emailed where it has an account; the same answer either way. */
    @PostMapping(value = "/delete-account", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> ask(@RequestParam String email, HttpServletRequest request) {
        Instant now = Instant.now();
        String address = email.trim();
        if (!recent.allow("email:" + address.toLowerCase(), perAddressPerHour, now)
                || !recent.allow("client:" + SlidingWindowLimiter.clientOf(request), perClientPerHour, now)) {
            return seeOther("/delete-account?throttled=1");
        }
        Optional<Pilot> pilot = address.length() <= 254 ? pilots.findByEmail(address) : Optional.empty();
        if (pilot.isPresent()) {
            links.deleteExpiredBefore(now.minus(Duration.ofDays(1)));
            String token = token();
            links.save(new MagicLink(
                    pilot.get().getEmail(), MagicLinkController.hash(PURPOSE + token), now.plus(LIFETIME)));
            send(pilot.get().getEmail(), base(request) + "/delete-account/confirm?token=" + token);
        }
        return seeOther("/delete-account?sent=1");
    }

    /** Where the emailed link opens: the address it is for, and a Delete button. Uses nothing up. */
    @GetMapping("/delete-account/confirm")
    public String confirm(HttpServletRequest request, @RequestParam String token, Model model) {
        if (tooMany(request)) {
            return "delete-account/expired";
        }
        Optional<MagicLink> link = links.findByTokenHash(MagicLinkController.hash(PURPOSE + token))
                .filter(l -> l.getConsumedAt() == null && l.getExpiresAt().isAfter(Instant.now()));
        if (link.isEmpty()) {
            return "delete-account/expired";
        }
        model.addAttribute("email", link.get().getEmail());
        model.addAttribute("token", token);
        return "delete-account/confirm";
    }

    /** Delete pressed: the link used up, and the account deleted as Setup deletes it. */
    @PostMapping(value = "/delete-account/confirm", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public String delete(HttpServletRequest request, @RequestParam String token) {
        if (tooMany(request)) {
            return "delete-account/expired";
        }
        String hash = MagicLinkController.hash(PURPOSE + token);
        Optional<MagicLink> link = links.findByTokenHash(hash);
        if (link.isEmpty() || links.consumeIfUsable(hash, Instant.now()) == 0) {
            return "delete-account/expired";
        }
        Optional<Pilot> pilot = pilots.findByEmail(link.get().getEmail());
        if (pilot.isPresent()) {
            try {
                accounts.delete(pilot.get());
            } catch (AccountNotDeletedException failed) {
                log.warn(
                        "account {} not deleted from the web page: {}",
                        pilot.get().getId(),
                        failed.getMessage());
                return "delete-account/not-deleted";
            }
        }
        return "delete-account/deleted";
    }

    private void send(String to, String url) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(to);
        message.setSubject("Delete your Wingtip Maps account");
        message.setText("Someone asked to delete the Wingtip Maps account for this address. To delete it, "
                + "open this link within 15 minutes and press Delete Account. If it was not you, ignore this "
                + "email: nothing is deleted.\n\n" + url);
        try {
            mailer.send(message);
        } catch (RuntimeException failed) {
            log.warn(
                    "A deletion link not sent (no address logged): {}",
                    failed.getClass().getSimpleName());
        }
    }

    /** As MagicLinkController builds its link: the configured address, else (a machine that mails nothing) the request's. */
    private String base(HttpServletRequest request) {
        return publicBaseUrl.isBlank()
                ? ServletUriComponentsBuilder.fromRequestUri(request)
                        .replacePath("")
                        .replaceQuery(null)
                        .build()
                        .toUriString()
                : publicBaseUrl;
    }

    /** Past the hour's limit of links checked from one caller: answered as a dead link, so it tells nothing. */
    private boolean tooMany(HttpServletRequest request) {
        return !recent.allow(
                "check:" + SlidingWindowLimiter.clientOf(request), linkChecksPerClientPerHour, Instant.now());
    }

    private String token() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static ResponseEntity<Void> seeOther(String where) {
        return ResponseEntity.status(HttpStatus.SEE_OTHER)
                .location(URI.create(where))
                .build();
    }
}
