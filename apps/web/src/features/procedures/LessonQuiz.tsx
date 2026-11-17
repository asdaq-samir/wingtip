import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { ListChoices, ListGroup, ListRow } from "../../components/GroupedList";
import StatusBadge from "../../components/StatusBadge";
import { Button } from "../../components/ui/button";
import { approachQuiz, type LessonInput } from "../../lib/approachLesson";
import type { QuizAnswer } from "../../lib/api/types";
import { NO_FOCUS, useLessonMap } from "../../lib/map/route/lessonMap";
import { TEXT } from "../../lib/text";
import { Progress, type FromInstructor } from "./LessonParts";

export function QuizPage({ input, from, gs }: { input: LessonInput; from?: FromInstructor; gs: number }) {
  const questions = useMemo(() => approachQuiz(input, gs), [input, gs]);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  // This attempt's answers, for the instructor's score: Ask Again starts anew.
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const done = at >= questions.length;
  const q = done ? null : questions[at]!;
  // A wrong answer shows where the right one is; until then, nothing.
  useEffect(() => {
    useLessonMap.setState({ focus: q && picked !== null && picked !== q.answer ? q.focus : NO_FOCUS, flight: null });
  }, [q, picked]);
  if (questions.length === 0) return <p className={cn("text-muted-foreground", TEXT.prose)}>See the plate</p>;
  if (!q) {
    return (
      <div className="space-y-3">
        <p className={cn("font-semibold", TEXT.row)} role="status">
          {right} of {questions.length} right
        </p>
        <Button
          className="w-full"
          onClick={() => {
            setAt(0);
            setPicked(null);
            setRight(0);
            setAnswers([]);
          }}
        >
          Ask Again
        </Button>
      </div>
    );
  }
  const answered = picked !== null;
  const pick = (choice: number) => {
    if (answered) return;
    setPicked(choice);
    if (choice === q.answer) setRight(right + 1);
    const next = [...answers, { question: q.prompt, chosen: q.choices[choice]!, right: choice === q.answer }];
    setAnswers(next);
    from?.onQuiz(next, questions.length);
  };
  return (
    <div className="space-y-3" data-testid="approach-quiz">
      <Progress at={at} of={questions.length} />
      <p className={cn("font-medium", TEXT.prose)} data-testid="approach-quiz-question">
        {q.prompt}
      </p>
      {/* A tap or Space answers, as the procedures' menus pick (ProcedureMenu):
          the arrow keys move between the choices without answering. */}
      <ListChoices value={picked === null ? "" : String(picked)} onChange={() => undefined} label={q.prompt}>
        <ListGroup>
          {q.choices.map((choice, i) => (
            <ListRow
              key={choice}
              radio={String(i)}
              title={choice}
              disabled={answered && i !== picked}
              onClick={() => pick(i)}
              data-testid="approach-quiz-choice"
            />
          ))}
        </ListGroup>
      </ListChoices>
      {answered && (
        <div className="space-y-2" data-testid="approach-quiz-result">
          <StatusBadge tone={picked === q.answer ? "up" : "down"}>{picked === q.answer ? "Right" : "Not quite"}</StatusBadge>
          {picked !== q.answer && <p className={cn("font-medium", TEXT.prose)}>The answer: {q.choices[q.answer]}</p>}
          <p className={cn("text-muted-foreground", TEXT.prose)}>{q.explain}</p>
          <Button
            className="w-full"
            onClick={() => {
              setAt(at + 1);
              setPicked(null);
            }}
            data-testid="approach-quiz-next"
          >
            {at === questions.length - 1 ? "See My Score" : "Next Question"}
          </Button>
        </div>
      )}
    </div>
  );
}
