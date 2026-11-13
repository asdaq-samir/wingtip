package app.wingtipmaps.gateway.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * This app's own settings, the {@code app} block of application.yml, bound
 * and checked once at start: each value, its environment variable and its
 * default is said there, with why; Boot's configuration processor makes
 * their metadata from this record. A class takes the record rather than a
 * value of it by name, so a key renamed or mistyped fails the start, not a
 * request.
 */
@ConfigurationProperties("app")
@Validated
public record AppProperties(
        // Where the app is reached, e.g. https://planner.example.com: an
        // email's links, the connector's issuer; blank on a machine that
        // mails nothing.
        String publicBaseUrl,
        // Comma-separated: the addresses whose pilot is a developer.
        String developerEmails,
        @NotBlank String staticLocation,
        boolean openWrites,
        boolean hsts,
        String chartTilesOrigin,
        @Valid @NotNull Upstream planner,
        @Valid @NotNull Internal internal,
        @Valid @NotNull Https https,
        @Valid @NotNull Speed speed,
        @Valid @NotNull MagicLink magicLink,
        @Valid @NotNull Subscription subscription,
        @Valid @NotNull ReviewSignIn reviewSignIn,
        @Valid @NotNull Monitoring monitoring,
        @Valid @NotNull Mcp mcp,
        @Valid @NotNull Apple apple,
        @Valid @NotNull Google google,
        @Valid @NotNull Ios ios,
        @Valid @NotNull Android android,
        @Valid @NotNull Mail mail) {

    /** The planner's address on the stack's network. */
    public record Upstream(@NotBlank String baseUrl) {}

    /** The port of the routes only other services call (0: none). */
    public record Internal(@PositiveOrZero int port) {}

    /** The phone's HTTPS port on the same Wi-Fi, where a keystore is named. */
    public record Https(
            String keystore,
            String keystorePassword,
            @PositiveOrZero int port) {}

    public record Speed(String labToken) {}

    /** The emailed link's own throttle, an hour each. */
    public record MagicLink(
            @PositiveOrZero int perAddressPerHour,
            @PositiveOrZero int perClientPerHour,
            @PositiveOrZero int accountPerClientPerHour) {}

    public record Subscription(
            boolean enabled, @PositiveOrZero int trialDays, String compedEmails) {}

    public record ReviewSignIn(boolean enabled, String email, String code) {}

    public record Monitoring(@NotNull Duration downAfter, String alertEmails, String weatherUrl) {}

    /** The MCP connector a pilot adds to their own Claude or ChatGPT. */
    public record Mcp(
            boolean enabled,
            String resource,
            List<String> redirectUris,
            String signingKey,
            String internalToken,
            @PositiveOrZero int registrationsPerClientPerHour,
            @PositiveOrZero int unusedClientDays) {}

    /** Sign in with Apple: the web's (team, key, Services ID and the .p8
     *  key's PEM), whether the iOS app's sign-in must carry its nonce,
     *  and where a deleted pilot's grant is revoked. */
    public record Apple(
            String teamId,
            String keyId,
            String servicesId,
            String privateKey,
            boolean requireNonce,
            @NotBlank String revokeUrl) {}

    public record Google(String clientId, String clientSecret) {}

    /** The iOS app's bundle id, for its links and its sign-in. */
    public record Ios(String bundleId) {}

    /** The Android app's package and its signing certificates' SHA-256s, comma-separated. */
    public record Android(String packageName, String certSha256) {}

    /** Where mail is sent through, and who it is from. */
    public record Mail(String host, @NotBlank String from) {}
}
