import { ListRow } from "../../components/GroupedList";
import SectionTitle from "../../components/SectionTitle";
import type { QuizAnswer } from "../../lib/api/types";
import { noteAt } from "../../lib/assignedLessons";
import { TEXT } from "../../lib/text";

/** An approach an instructor set as a lesson (AssignedLesson): their name
 *  and their notes at its fixes, shown on the brief's and the flying's
 *  cards, and where the lesson reports how far the student has come -- the
 *  brief finished, flown to its end, each quiz answer (the answers so far,
 *  of how many) -- with what went wrong sending it, said on the card. */
export interface FromInstructor {
  instructorName: string;
  notes: Record<string, string>;
  onBriefed: () => void;
  onFlown: () => void;
  onQuiz: (answers: QuizAnswer[], of: number) => void;
  problem: string | null;
}

/** "Your instructor: …" under a step whose fix they left a note at. */
export function InstructorNote({ from, fix }: { from: FromInstructor | undefined; fix: string | null }) {
  const note = noteAt(from?.notes, fix);
  if (!from || !note) return null;
  return (
    <ListRow
      title={<span className={TEXT.prose}>Your instructor: “{note}”</span>}
      description={from.instructorName}
      data-testid="approach-instructor-note"
    />
  );
}

/** "3 of 10" over a step, a section's title (SectionTitle), said as it changes. */
export const Progress = ({ at, of }: { at: number; of: number }) => (
  <SectionTitle aria-live="polite" data-testid="approach-lesson-progress">{`${at + 1} of ${of}`}</SectionTitle>
);
