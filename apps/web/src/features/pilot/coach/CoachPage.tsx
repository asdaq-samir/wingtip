import { cn } from "cn";
import { ListChoices, ListGroup, ListRow } from "../../../components/GroupedList";
import { said } from "../../../lib/endorsements";
import { FINDING_TONE, type Finding } from "../../../lib/findings";
import { TEXT } from "../../../lib/text";
import type { CoachDue, CoachSession, CoachWords, ProficiencyPlan } from "./coachApi";
import { CERTIFICATES, useCoach, type Certificate } from "./useCoach";

/**
 * The Logbook's Coach: a pilot's own proficiency plan. On the pilot's
 * ask, what is due and when (14 CFR 61.56, 61.57), what their debriefed
 * flights show, and up to four sessions -- what, why, where and how long,
 * and where it may count toward WINGS -- all the engine's
 * (proficiency_plan), with a short paragraph and a line a session in
 * words from the assistant, each resting on the plan's own lines. It
 * opens on the paragraph and the sessions; the currencies and the
 * evidence fold under them (docs/decisions/0012).
 */
export default function CoachPage() {
  const c = useCoach();
  return (
    <section aria-label="Coach" className="space-y-5" data-testid="coach">
      <ListGroup title="Your Certificate">
        <ListChoices value={c.certificate} onChange={v => c.choose(v as Certificate)} label="Your certificate">
          {CERTIFICATES.map(o => <ListRow key={o.value} radio={o.value} title={o.label} />)}
        </ListChoices>
      </ListGroup>
      <ListGroup>
        <ListRow
          title={<span className="text-tint">{c.plan ? "Make It Again" : "Make My Plan"}</span>}
          description={c.making ? "Reading your logbook and your flights' debriefs…"
            : `From your logbook, your saved flights' tracks and the fields near ${c.home ?? "your home base"}`}
          onClick={c.make} disabled={!c.ready || c.making} data-testid="coach-make"
        />
      </ListGroup>
      {c.problem && <p className={cn("px-1", FINDING_TONE.stop, TEXT.prose)} role="alert">{c.problem.message}</p>}
      {c.plan && <Plan plan={c.plan} words={c.words} wording={c.wording} />}
    </section>
  );
}

const STATUS: Record<CoachDue["status"], { tone: Finding; words: (d: CoachDue) => string }> = {
  current: { tone: "ok", words: d => `To ${said(d.until!)}` },
  due_soon: { tone: "caution", words: d => `${d.days_left} days left` },
  lapsed: { tone: "stop", words: () => "Lapsed" },
  pending: { tone: "caution", words: d => `From ${said(d.from!)}` },
  unknown: { tone: "unknown", words: () => "Not on record" },
};

function Plan({ plan, words, wording }: { plan: ProficiencyPlan; words: CoachWords | null; wording: boolean }) {
  const lines = new Map((words?.session_lines ?? []).map(l => [l.session, l.text]));
  return (
    <>
      {plan.reminders.length > 0 && (
        <ListGroup title="Reminders">
          {plan.reminders.map(r => <ListRow key={r.key} title={<span className={FINDING_TONE.caution}>{r.text}</span>} data-testid="coach-reminder" />)}
        </ListGroup>
      )}
      <Words words={words} wording={wording} />
      <ListGroup title="Sessions">
        {plan.sessions.length ? plan.sessions.map(s => <Session key={s.id} s={s} line={lines.get(s.id)} />)
          : <ListRow muted title="Nothing to practise for now: every currency is good past the reminders, and no debrief shows a weak area." />}
      </ListGroup>
      <ListGroup title="What Is Due">
        {plan.due.map(d => (
          <ListRow
            key={d.key} title={d.label} description={`${d.rule} · ${d.detail}`} data-testid="coach-due"
            value={<span className={cn("tabular-nums", FINDING_TONE[STATUS[d.status].tone])}>{STATUS[d.status].words(d)}</span>}
          />
        ))}
      </ListGroup>
      {plan.weak_areas.length > 0 && (
        <ListGroup title="From Your Debriefs">
          {plan.weak_areas.map(w => (
            <details key={w.key} className="px-1 py-1" data-testid="coach-weak">
              <summary className={cn("cursor-pointer", TEXT.row)}>{w.label} · {w.evidence.length} · ACS {w.acs.join(", ")}</summary>
              <ul className={cn("mt-1 space-y-1 text-muted-foreground", TEXT.detail)}>
                {plan.evidence.filter(e => w.evidence.includes(e.id)).map(e => (
                  <li key={e.id}>{said(e.flown_on)} at {e.place}: {e.text}</li>
                ))}
              </ul>
            </details>
          ))}
        </ListGroup>
      )}
    </>
  );
}

function Words({ words, wording }: { words: CoachWords | null; wording: boolean }) {
  if (wording) return <p className={cn("px-1 text-muted-foreground", TEXT.prose)}>Putting your plan into words…</p>;
  if (!words) return null;
  if (!words.sentences.length) {
    return words.unavailable ? <p className={cn("px-1 text-muted-foreground", TEXT.prose)}>No words for now: {words.unavailable}</p> : null;
  }
  return (
    <p className={cn("px-1", TEXT.prose)} data-testid="coach-words">
      {words.sentences.map(s => s.text).join(" ")}
    </p>
  );
}

function Session({ s, line }: { s: CoachSession; line: string | undefined }) {
  const where = s.place ? `${s.place.ident}${s.place.approach ? `, ${s.place.approach}` : ""} · ` : "";
  const who = s.instructor ? " · With an instructor" : "";
  return (
    <ListRow
      title={s.practise} data-testid="coach-session"
      description={
        <>
          {`${where}About ${s.minutes} min${who}`}
          {s.wings && <span className="block">May count toward WINGS: {s.wings.area}, ACS {s.wings.acs}</span>}
          {line && <span className="block text-foreground">{line}</span>}
        </>
      }
    />
  );
}
