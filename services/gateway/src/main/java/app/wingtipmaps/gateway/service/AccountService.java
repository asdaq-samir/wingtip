package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.security.mcp.ConnectorGrants;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.io.Serial;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Deleting a pilot's account, everything that was theirs with it --
 * App Review's 5.1.1(v): an app that lets an account be made lets it be
 * deleted, from inside the app.
 *
 * <p>In this order: first the checkpoint notes the pilot wrote for
 * themselves, which the planner keeps (its routers/notes.py), since the
 * planner may not answer; then Apple's grant is revoked (AppleRevocation,
 * best effort, so Apple being down never keeps an account); then, in one transaction, the pilot's row --
 * the database cascades it to their aircraft, flights, logbook and
 * endorsements, their instructors and students and the solo
 * cross-countries between them (V26), the approaches set as lessons
 * between them (V30) -- and the sign-in links ever sent
 * to their address, and the connections to AI apps they made (the
 * connector's tokens and consents, ConnectorGrants); last
 * every session they hold, on any device, under any of the names they
 * sign in by. Only the planner being down leaves the account whole: the
 * notes cannot be given back, so a database failure after them leaves
 * the account without its notes, and once the transaction commits the
 * account is gone whatever happens to the sessions.
 *
 * <p>An endorsement an instructor signed in the app stays with the other
 * of the two, its student or instructor left out: the student's
 * endorsement is theirs, and the instructor must keep a record of it for
 * 3 years (14 CFR 61.189(b), (c)).
 */
@Service
public class AccountService {

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final PilotRepository pilots;
    private final MagicLinkRepository magicLinks;
    private final FindByIndexNameSessionRepository<? extends Session> sessions;
    private final TransactionTemplate transaction;
    private final AppleRevocation apple;
    /** The planner's client (UpstreamClients): HTTP/1.1, as StreamingProxy says why. */
    private final PlannerApi planner;
    /** The AI apps the pilot connected (the MCP connector), absent in a
     *  slice test that has no database. */
    private ConnectorGrants connections;

    public AccountService(
            PilotRepository pilots,
            MagicLinkRepository magicLinks,
            FindByIndexNameSessionRepository<? extends Session> sessions,
            TransactionTemplate transaction,
            AppleRevocation apple,
            PlannerApi planner) {
        this.pilots = pilots;
        this.magicLinks = magicLinks;
        this.sessions = sessions;
        this.transaction = transaction;
        this.apple = apple;
        this.planner = planner;
    }

    @Autowired(required = false)
    void setConnections(ConnectorGrants connections) {
        this.connections = connections;
    }

    /**
     * Deletes the pilot and everything that was theirs.
     *
     * @throws AccountNotDeletedException when the planner cannot take the
     *     pilot's notes; nothing else has been deleted then
     */
    public void delete(Pilot pilot) {
        forgetNotes(pilot);
        apple.revoke(pilot.getAppleRefreshToken());
        transaction.executeWithoutResult(status -> {
            magicLinks.deleteByEmail(pilot.getEmail());
            // Claude's and ChatGPT's tokens for the connector end with it.
            if (connections != null) {
                connections.forget(pilot.getId());
            }
            pilots.deleteNow(pilot.getId());
        });
        // A magic link signs in under the address, Google and Apple under
        // their own subject: whichever this pilot used, on whatever device.
        Stream.of(pilot.getEmail(), pilot.getGoogleSubject(), pilot.getAppleSubject())
                .filter(name -> name != null && !name.isBlank())
                .forEach(this::endSessions);
    }

    /** The account is already gone, so a failure here must not turn the
     *  answer into an error: the browser would not clear this device. */
    private void endSessions(String name) {
        try {
            sessions.findByPrincipalName(name).keySet().forEach(sessions::deleteById);
        } catch (RuntimeException failed) {
            // Not the name: it is the deleted pilot's address or Apple or
            // Google subject, and the logs outlive the account.
            log.error(
                    "Account deleted but its sessions could not all be ended: {}",
                    failed.getClass().getSimpleName());
        }
    }

    private void forgetNotes(Pilot pilot) {
        try {
            planner.forgetNotes(String.valueOf(pilot.getId()));
        } catch (RestClientResponseException refused) {
            throw new AccountNotDeletedException(
                    "the planner answered " + refused.getStatusCode().value());
        } catch (RestClientException failed) {
            throw new AccountNotDeletedException("the planner could not be reached", failed);
        }
    }

    /** The account is untouched: the planner could not take the pilot's
     *  notes, and nothing is deleted until it can. */
    public static class AccountNotDeletedException extends RuntimeException {
        @Serial
        private static final long serialVersionUID = 1L;

        AccountNotDeletedException(String why) {
            super(why);
        }

        AccountNotDeletedException(String why, Throwable cause) {
            super(why, cause);
        }
    }
}
