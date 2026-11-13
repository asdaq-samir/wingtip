import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import PaidPrompt from "../../components/PaidPrompt";
import { PRICE, standing, subscriptionQuery } from "../../lib/subscription";
import { TEXT } from "../../lib/text";
import { FINDING_TONE } from "../../lib/findings";
import { FieldError } from "../../components/ui/field";

const PLANS = { MONTHLY: "Monthly", YEARLY: "Yearly" } as const;
const STORES = { APP_STORE: "App Store", PLAY: "Google Play", WEB: "Website", GRANT: "Given" } as const;

/**
 * The Personal tab's Subscription page (PilotPanel): what the pilot has
 * -- the free month and until when, or the plan paid for. With none,
 * the way to the free month (PaidPrompt). What stays free is said
 * once, under it all: planning and flying never need it.
 */
export default function SubscriptionPanel() {
  const { data: subscription, isPending, error } = useQuery(subscriptionQuery);
  if (isPending)
    return (
      <p role="status" className={cn("px-1 text-muted-foreground", TEXT.note)}>
        Checking your subscription…
      </p>
    );
  if (error || !subscription) {
    return <FieldError className={cn("px-1", FINDING_TONE.stop, TEXT.prose)}>Your subscription could not be checked.</FieldError>;
  }
  return (
    <div className="space-y-4" data-testid="subscription-panel">
      {/* What it is and costs, rows where they were a footnote: planning and
          flying are free; the subscription adds the debrief. */}
      <ListGroup>
        <ListRow title="Status" value={standing(subscription)} data-testid="subscription-standing" />
        {subscription.plan && <ListRow title="Plan" value={PLANS[subscription.plan]} />}
        {subscription.store && <ListRow title="Bought on" value={STORES[subscription.store]} />}
        <ListRow title="Adds" description="The debrief" />
        <ListRow title="Price" value={`${PRICE.monthly} or ${PRICE.yearly}`} />
      </ListGroup>
      {!subscription.entitled && <PaidPrompt title="The Subscription">Your flown track measured against the plan.</PaidPrompt>}
    </div>
  );
}
