import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { ListRow } from "../../../components/GroupedList";
import { api, errorMessage } from "../../../lib/api/client";
import { done } from "../../../lib/doneNote";
import { showError } from "../../../lib/problems";
import { capitalised } from "../../../lib/capitals";

/**
 * One door into the stack, which opens what it links to -- starting the
 * service first if it is not running.
 *
 * A link to a stopped service is a dead link, and telling a developer
 * to go and type the compose command is a worse answer than doing it.
 * The planner starts it through docker-compose.yml's dev-services
 * sidecar, which holds the Docker socket and can start nothing but a
 * fixed list of four names.
 *
 * The tab is opened *before* the start, not after: a browser only
 * allows window.open during the click that asked for it, and one
 * opened after an await is a popup the browser blocks. So the tab
 * appears immediately and is pointed at the service once it answers.
 * It is opened without "noopener", which makes window.open return
 * null -- the tab was then never pointed anywhere and stayed blank --
 * and cut off from this page by hand instead.
 *
 * A service with no container yet is a plain link: the sidecar only
 * starts what `docker compose up` created, and refused it every time.
 *
 * A row of a grouped list, as a link out is in Settings, where it was
 * an outlined button in a wrapping line of them.
 */
export function StackLink({ link }: { link: { label: string; href: string; service?: string; note?: string } }) {
  const queryClient = useQueryClient();
  const { data: dev } = useQuery({
    queryKey: ["devServices"],
    queryFn: api.devServices,
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });
  const start = useMutation({ mutationFn: api.startDevService, meta: { silent: true } });

  const state = dev?.services.find((s) => s.name === link.service)?.state;
  const startable = !!link.service && dev?.available === true && state !== undefined && state !== "running" && state !== "absent";

  if (!startable) return <ListRow title={link.label} description={link.note} href={link.href} />;

  return (
    <ListRow
      title={start.isPending ? `Starting ${link.service}…` : link.label}
      description={`Not running; opening it starts ${link.service}`}
      disabled={start.isPending}
      onClick={() => {
        const tab = window.open("", "_blank");
        if (tab) tab.opener = null;
        start.mutate(link.service!, {
          onSuccess: () => {
            done(`${capitalised(link.service ?? "")} Started`);
            // So the control goes back to being a plain link rather
            // than still offering to start what is now running.
            void queryClient.invalidateQueries({ queryKey: ["devServices"] });
            // A container that has just started is not yet listening,
            // so the tab waits a moment rather than landing on a
            // connection refused.
            window.setTimeout(() => {
              if (tab) tab.location.href = link.href;
            }, 2500);
          },
          onError: (err) => {
            tab?.close();
            showError(`Could not start ${link.service}`, errorMessage(err, "the sidecar gave no reason"));
          },
        });
      }}
    >
      <ExternalLink className="size-4 text-tint" aria-hidden />
    </ListRow>
  );
}
