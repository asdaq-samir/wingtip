package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.SubscriptionDto;
import app.wingtipmaps.gateway.service.SubscriptionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in pilot's subscription to the paid features (see
 * {@link SubscriptionService}): what it is, and the free month started.
 * Pilot-scoped: 401 signed out.
 */
@RestController
@RequestMapping("/api/subscription")
@Tag(name = "Subscription", description = "The paid features: the free month, and what is paid for")
public class SubscriptionController {

    private final SubscriptionService subscriptions;

    public SubscriptionController(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @Operation(summary = "The pilot's subscription, with this month's uses against each cap")
    @GetMapping
    public ResponseEntity<SubscriptionDto> get(Pilot pilot) {
        // None sold here: nothing to say of one.
        if (!subscriptions.sold()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(subscriptions.status(pilot));
    }

    @Operation(
            summary = "Start the free month",
            description = "Once an account: 409 once it has been started, even after it ended. On the website; "
                    + "in the iOS and Android apps the free month is the store's introductory offer.")
    @PostMapping("/trial")
    public ResponseEntity<SubscriptionDto> startTrial(Pilot pilot) {
        if (!subscriptions.sold()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(subscriptions.startTrial(pilot));
    }
}
