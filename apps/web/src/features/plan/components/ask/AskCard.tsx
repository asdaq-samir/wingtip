import { useRef, useState } from "react";
import { ArrowUp, Check, Square } from "lucide-react";
import { cn } from "cn";
import IconButton from "../../../../components/IconButton";
import { PillSection } from "../../../../components/Favorites";
import { PANEL_FIELD } from "../../../../components/panelField";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import SkeletonLines from "../../../../components/SkeletonLines";
import { TEXT } from "../../../../lib/text";
import SourceChips from "../../../../components/SourceChips";
import { useAsk, type AskTurn } from "../../../../lib/ask/useAsk";
import { useClaudeOn } from "../../../../lib/subscription";
import { TripPlanner } from "../../../tripPlanner";
import { useVoice, VoiceButton } from "../../../voice";
import { FieldError } from "../../../../components/ui/field";

/** One question and its answer: the question at the right as a message
 *  of the pilot's own, the answer at the left as prose with its figures
 *  lined up, the tool in use as a passing line while it is, the changes
 *  it proposes as filled chips to tap (useAsk's apply), then the reports
 *  it rests on (SourceChips), and what went wrong in its place. */
function Turn({ turn }: { turn: AskTurn }) {
  // A chip applies only where there is a plan to change (PlanWorkspace).
  const canApply = useAsk((s) => s.applyChange !== null);
  return (
    <div className="flex flex-col gap-1.5" data-testid="ask-turn">
      <p
        className={cn("max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-primary-foreground", TEXT.prose)}
        data-testid="ask-question"
      >
        {turn.question}
      </p>
      {turn.status && (
        <p className={cn("appear text-muted-foreground", TEXT.note)} role="status" data-testid="ask-status">
          {turn.status}…
        </p>
      )}
      {/* The answer's shape where it will be, until its first words. */}
      {turn.status && !turn.answer && <SkeletonLines className="w-4/5 self-start rounded-2xl rounded-bl-md bg-card px-3.5 py-3" />}
      {/* The answer as the assistant's own message: a white card at the
          left with its chips inside, as the canvas's Ask screen (7) has
          it, facing the pilot's blue one. */}
      {(turn.answer || turn.done) && (
        <div
          className="flex max-w-[92%] flex-col gap-2.5 self-start rounded-2xl rounded-bl-md bg-card px-3.5 py-3 shadow-float"
          data-testid="ask-bubble"
        >
          {turn.answer && (
            <p className={cn("tabular-nums whitespace-pre-wrap", TEXT.prose)} data-testid="ask-answer">
              {turn.answer}
            </p>
          )}
          {/* Each change proposed, a filled chip in the tint: the tap
              applies it and the chip says so with a check; nothing is
              applied without the tap. A chip is 32 points, its area the
              44 by the pseudo-element, the row at gap-2. */}
          {turn.actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" data-testid="ask-actions">
              {turn.actions.map((a, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={a.applied ? "secondary" : "default"}
                  disabled={a.applied || !canApply}
                  className={cn(
                    "relative rounded-full after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
                    a.applied && "disabled:opacity-100",
                  )}
                  onClick={() => useAsk.getState().apply(a.change)}
                  data-testid="ask-action"
                  data-applied={a.applied ? "1" : undefined}
                >
                  {a.applied && <Check aria-hidden />}
                  {a.applied ? a.done : a.label}
                </Button>
              ))}
            </div>
          )}
          {turn.done && <SourceChips sources={turn.sources} testId="ask-source" />}
        </div>
      )}
      {turn.error && (
        <FieldError className={cn("text-destructive-ink", TEXT.note)} data-testid="ask-problem">
          {turn.error}
        </FieldError>
      )}
    </div>
  );
}

/** What a pilot asks first, offered as chips while nothing has been asked
 *  (the canvas's Ask screen): one tap asks it. */
const FIRST_QUESTIONS = ["Brief me", "Is the weather within my minimums?", "What if I leave an hour later?"];

/**
 * The Brief's first section, the assistant's home: one line, "Ask about
 * this flight", with the microphone and Send at its end, that opens into
 * the conversation as the field is focused or a question is in flight,
 * and stays open while there is one to read (Clear folds it). The
 * answer is asked with the plan, the airplane's position and the pilot's
 * own minimums and currency (useAsk). "Plan a trip…", the first chip,
 * puts the trip planner (features/tripPlanner) in its place until closed.
 * The microphone is Ask by voice (features/voice): the words appear in
 * the field as they are said, as a phone's dictation types them, and are
 * sent as the pause ends them.
 *
 * Not there at all while the deployment keeps Claude off (useClaudeOn):
 * the owner, 2026-11-10, "To keep the cost low, we only add the claude
 * feature later when we decide about subscription model. For now just the
 * free siri and gemini." The web has no free model of its own to ask.
 */
export default function AskSection() {
  return useClaudeOn() ? <AskConversation /> : null;
}

function AskConversation() {
  const turns = useAsk((s) => s.turns);
  const busy = useAsk((s) => s.busy);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  // "Plan a trip…": the trip planner in the section's place until closed.
  const [trip, setTrip] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const expanded = focused || busy || turns.length > 0;
  // Asked by voice only where speech stays on the device (features/
  // voice): the words in the field as they are said, asked as the pause
  // ends them.
  const voice = useVoice("ask", (said) => {
    setText("");
    void useAsk.getState().ask(said);
  });
  const send = () => {
    const question = text.trim();
    if (!question || busy) return;
    setText("");
    void useAsk.getState().ask(question);
  };
  if (trip) {
    return (
      <PillSection title="Plan a Trip" testId="brief-ask">
        <TripPlanner onClose={() => setTrip(false)} />
      </PillSection>
    );
  }
  return (
    <PillSection
      title="Ask"
      testId="brief-ask"
      right={
        turns.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => useAsk.getState().clear()} data-testid="ask-clear">
            Clear
          </Button>
        ) : undefined
      }
    >
      {expanded && turns.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="ask-conversation">
          {turns.map((t) => (
            <Turn key={t.id} turn={t} />
          ))}
        </div>
      )}
      {/* The first questions as outlined chips, until one is asked. */}
      {turns.length === 0 && !busy && (
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1" data-testid="ask-suggestions">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full border-tint"
            onClick={() => setTrip(true)}
            data-testid="ask-plan-trip"
          >
            Plan a trip…
          </Button>
          {FIRST_QUESTIONS.map((q) => (
            <Button
              key={q}
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full border-tint"
              onClick={() => void useAsk.getState().ask(q)}
              data-testid="ask-suggestion"
            >
              {q}
            </Button>
          ))}
        </div>
      )}
      {/* The field row as the canvas's Ask screen (7) draws it: a round
          48-point field, the microphone a round white button with the
          tint's glyph beside it, and Send a round filled one; each its
          own 44-point area, so gap-2 is room enough. A form, so Enter
          (and the keyboard's Send) sends it as the browser submits one. */}
      <form
        className="flex items-center gap-2"
        data-composer=""
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          ref={field}
          value={voice.listening ? voice.words : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={voice.listening ? voice.prompt : "Ask about this flight"}
          aria-label="Ask about this flight"
          enterKeyHint="send"
          autoComplete="off"
          data-testid="ask-field"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn("h-12 rounded-full border-0 px-4", PANEL_FIELD)}
        />
        {voice.offered && (
          <VoiceButton field="ask" label="Ask by voice" onPress={voice.press} testId="ask-mic" className="size-12 bg-card shadow-float" />
        )}
        {busy ? (
          <IconButton
            label="Stop"
            variant="secondary"
            size="icon-lg"
            className="size-12 shrink-0 rounded-full"
            onClick={() => useAsk.getState().stop()}
            data-testid="ask-stop"
          >
            <Square className="size-4" />
          </IconButton>
        ) : (
          <IconButton
            label="Send"
            variant="default"
            size="icon-lg"
            className="size-12 shrink-0 rounded-full"
            type="submit"
            disabled={!text.trim()}
            data-testid="ask-send"
          >
            <ArrowUp className="size-5" />
          </IconButton>
        )}
      </form>
      {/* Why the mic heard nothing, under the field it was for. */}
      {voice.error && (
        <FieldError className={cn("text-destructive-ink", TEXT.note)} data-testid="ask-voice-problem">
          {voice.error}
        </FieldError>
      )}
    </PillSection>
  );
}
