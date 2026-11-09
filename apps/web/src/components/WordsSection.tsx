import type { ReactNode } from "react";
import { cn } from "cn";
import { PillSection } from "./Favorites";
import { Skeleton } from "./ui/skeleton";
import { describeError } from "../lib/api/client";
import { TEXT } from "../lib/text";
import SourceChips from "./SourceChips";
import type { WordsState } from "../lib/wordsState";

/** Why there are no words, as a sentence under the section's title: it
 *  was "Words unavailable: Not Found", a label and HTTP's raw reason
 *  (the UI audit, 2026-11-09). */
const sentence = (why: string) => `${why.charAt(0).toUpperCase()}${why.slice(1)}${/[.!?]$/.test(why) ? "" : "."}`;

/**
 * One section of plain-language words with the reports they rest on:
 * the Brief's risk picture, its NOTAMs and its weather (BriefWords), and
 * the debrief's what to practise (DebriefWords). Its title is the way to
 * the list in full where there is one (`onMore`, the owner's rule for
 * every section's heading), three lines of skeleton while the words are
 * written, and where the model could not be reached, why, as a sentence
 * in the note's size and nothing else -- never a toast
 * (lib/problems). The figures the section is about stay in the Brief's
 * own cards either way.
 */
export default function WordsSection({ title, onMore, testId, state, credit, empty, children }: {
  title: string;
  onMore?: () => void;
  testId: string;
  state: WordsState;
  /** The credit line under the chips (the NOTAMs': the feed and since
   *  when), in the note's size: a source line, not a footnote. */
  credit?: string;
  /** What no sentence and no failure reads, where there is something to
   *  say about it (the NOTAMs': none heard since a day). */
  empty?: string;
  /** Under the words: the debrief's note for the instructor. */
  children?: ReactNode;
}) {
  const { answer, error, pending } = state;
  const unavailable = error ? describeError(error, "the planner did not answer") : answer?.unavailable ?? null;
  return (
    <PillSection title={title} onMore={onMore} testId={testId}>
      {pending ? (
        <div className="flex flex-col gap-2 py-0.5" aria-busy="true" data-testid={`${testId}-pending`}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : unavailable ? (
        <p className={cn("text-muted-foreground", TEXT.note)} data-testid={`${testId}-unavailable`}>{sentence(unavailable)}</p>
      ) : answer && (
        <>
          {answer.sentences.length === 0 && empty ? (
            <p className={cn("text-muted-foreground", TEXT.prose)} data-testid={`${testId}-empty`}>{empty}</p>
          ) : (
            <p className={cn("tabular-nums", TEXT.prose)} data-testid={`${testId}-words`}>
              {answer.sentences.map((s, i) => <span key={i} data-sources={s.sources.join(" ")}>{i > 0 ? " " : ""}{s.text}</span>)}
            </p>
          )}
          {/* Eight under the chips: the next section's title reaches 8 up
              for its 44 points (PillSection), and a chip's 6 down, where
              the NOTAMs' chip lost its area's foot to the weather's title
              on CI's iPad (the iOS audit's P1, 2026-11-05). */}
          <div className="pb-2"><SourceChips sources={answer.sources} testId={`${testId}-source`} /></div>
          {credit && <p className={cn("text-muted-foreground", TEXT.note)} data-testid={`${testId}-credit`}>{credit}</p>}
          {children}
        </>
      )}
    </PillSection>
  );
}
