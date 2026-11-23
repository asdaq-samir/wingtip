package app.wingtipmaps.gateway.service;

import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.core.retry.RetryPolicy;
import org.springframework.core.retry.RetryTemplate;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * How this app asks the planner a rule (PlannerClient, PaperworkClient,
 * AircraftLimits): sent again once where it could not be reached, its
 * failure said as who could not answer what, and a list answered one for
 * each ask or not at all.
 */
final class PlannerRules {

    private PlannerRules() {}

    /**
     * A rule is a pure answer from what is sent, so one that fails to reach
     * the planner is sent once more: the pooled connection may be one the
     * planner (uvicorn, 5 s keep-alive) closed while it sat idle, and the
     * JDK does not resend a POST on its own. That failed every rule asked
     * after a quiet minute -- a pilot's currency, a student's experience --
     * with "could not be reached", several at once (the end-of-wave browser
     * run, 2026-11-08). WingtipApplication also lets the JDK's pool drop a
     * connection before uvicorn does. A timeout is not tried again.
     */
    private static final RetryTemplate AGAIN_ONCE = new RetryTemplate(RetryPolicy.builder()
            .maxRetries(1)
            .delay(Duration.ZERO)
            .includes(ResourceAccessException.class)
            .excludes(HttpTimeoutException.class)
            .build());

    /** A rule asked of the planner (sent again once where it could not be
     *  reached), its answer made into what the caller keeps. A field the
     *  planner always sends that is missing is not its answer either: the
     *  generated types box every value, so it shows as a
     *  NullPointerException where it is made into this app's own. */
    static <A, T> T rule(String what, Supplier<A> call, Function<A, T> made) {
        A answer = ask("the planner", what, () -> AGAIN_ONCE.invoke(call));
        try {
            return made.apply(answer);
        } catch (NullPointerException notItsAnswer) {
            throw new PlannerUnavailableException(
                    "the planner's answer to " + what + " was not its answer", notItsAnswer);
        }
    }

    /** {@code call} made, its failure said as who could not answer what. */
    static <A> A ask(String who, String what, Supplier<A> call) {
        try {
            return call.get();
        } catch (RestClientResponseException refused) {
            throw new PlannerUnavailableException(
                    who + " answered " + refused.getStatusCode().value() + " to " + what, refused);
        } catch (ResourceAccessException unreached) {
            throw new PlannerUnavailableException(who + " could not be reached for " + what, unreached);
        } catch (RestClientException notItsAnswer) {
            throw new PlannerUnavailableException(who + "'s answer to " + what + " was not its answer", notItsAnswer);
        }
    }

    /** An answer of one per ask, else the planner answered something else. */
    static void sameLength(String what, int answered, int asked) {
        if (answered != asked) {
            throw new PlannerUnavailableException("the planner answered " + what + " with a list of another length");
        }
    }
}
