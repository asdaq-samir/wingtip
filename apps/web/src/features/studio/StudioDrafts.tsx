import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { FieldError } from "../../components/ui/field";
import { TEXT } from "../../lib/text";
import type { StudioDraft } from "./draftsApi";
import type { Drafts } from "./useDrafts";

const STATUS: Record<StudioDraft["status"], { label: string; variant: "default" | "secondary" | "outline" | "ghost" }> = {
  needs_identity: { label: "Needs identity check", variant: "outline" },
  ready: { label: "Ready", variant: "default" },
  rendered: { label: "Rendered", variant: "secondary" },
  dismissed: { label: "Dismissed", variant: "ghost" },
};

const SOURCES: Record<string, string> = { faa_statement: "FAA statement", faa_notice: "FAA preliminary notice", ntsb: "NTSB" };

function title(d: StudioDraft) {
  return `${d.aircraft ?? "Aircraft"} · ${[d.city, d.state].filter(Boolean).join(", ")}`;
}

/**
 * The Studio's crash drafts (docs/STUDIO-PIPELINE.md): each lead the
 * crash-leads job found, with where it stands, and the one open with what
 * the identity check found, the sources' own words and the developer's
 * three answers. "Preliminary" is said on every draft, and a draft with no
 * ADS-B track says so: it is never given a guessed path.
 */
export function StudioDrafts({ drafts }: { drafts: Drafts }) {
  const d = drafts.draft;
  if (d) {
    const status = STATUS[d.status];
    return (
      <div className="flex flex-col gap-4" data-testid="studio-draft">
        <div className="flex flex-col gap-1.5">
          <p className={cn("font-semibold", TEXT.title)}>{title(d)}</p>
          <p className={cn("text-muted-foreground", TEXT.note)}>
            {d.local_date}
            {d.local_time ? ` ${d.local_time} local` : ""}
            {d.n_number ? ` · ${d.n_number}` : ""} · Preliminary
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant={status.variant} data-testid="studio-draft-status">
              {status.label}
            </Badge>
            {d.track === "none" && (
              <Badge variant="outline" data-testid="studio-draft-no-track">
                No ADS-B track
              </Badge>
            )}
          </div>
        </div>
        {d.identity && (
          <ListGroup title="Identity check">
            {d.identity.checks.map((c) => (
              <ListRow key={c.check} title={c.ok ? "Agrees" : "Doesn't agree"} description={c.words} />
            ))}
          </ListGroup>
        )}
        <ListGroup title="Sources">
          {d.sources.map((s, i) => (
            <ListRow
              key={i}
              title={SOURCES[s.source] ?? s.source}
              description={s.text ? `“${s.text}”` : s.heading}
              href={s.url?.startsWith("http") ? s.url : undefined}
            />
          ))}
        </ListGroup>
        <div className="flex flex-col gap-2">
          {d.status === "needs_identity" && (
            <Button onClick={drafts.confirm} disabled={drafts.busy} data-testid="studio-draft-confirm">
              Identity is right
            </Button>
          )}
          {(d.status === "needs_identity" || d.status === "ready") && (
            <Button variant="outline" onClick={drafts.reject} disabled={drafts.busy} data-testid="studio-draft-reject">
              Not this airplane
            </Button>
          )}
          {d.status !== "dismissed" && (
            <Button variant="outline" onClick={drafts.dismiss} disabled={drafts.busy} data-testid="studio-draft-dismiss">
              Dismiss
            </Button>
          )}
          <Button variant="ghost" onClick={() => drafts.select(null)} data-testid="studio-draft-close">
            All drafts
          </Button>
          {drafts.problem && <FieldError>{drafts.problem}</FieldError>}
        </div>
      </div>
    );
  }
  if (drafts.drafts.length === 0) return null;
  return (
    <ListGroup title="Drafts">
      {drafts.drafts.map((x) => (
        <ListRow
          key={x.id}
          title={title(x)}
          description={`${x.local_date}${x.n_number ? ` · ${x.n_number}` : ""}${x.track === "none" ? " · No ADS-B track" : ""}`}
          value={<Badge variant={STATUS[x.status].variant}>{STATUS[x.status].label}</Badge>}
          onClick={() => drafts.select(x.id)}
          chevron
          data-testid={`studio-draft-${x.id}`}
        />
      ))}
    </ListGroup>
  );
}
