// DeadZone — low-stakes trivia filler for the dead zone (IDEOLOGY law 10:
// the filler must never out-reward the work; law 4: interruptibility is
// sacred). Stays mounted always; when `active` flips false it freezes
// synchronously — no pending timeout survives, no state updates after.

import { useEffect, useRef, useState } from 'react';
import type { DeadZoneGameProps } from '../types';
import trivia from '../../content/trivia.json';

interface TriviaItem {
  id: string;
  kind: string;
  prompt: string;
  code: string | null;
  choices: [string, string, string];
  answerIndex: number;
  explanation: string;
}

const QUESTIONS = trivia as TriviaItem[];

function pickNextIndex(currentIndex: number): number {
  if (QUESTIONS.length <= 1) return 0;
  let next = currentIndex;
  while (next === currentIndex) {
    next = Math.floor(Math.random() * QUESTIONS.length);
  }
  return next;
}

function DeadZone({ active }: DeadZoneGameProps) {
  const [questionIndex, setQuestionIndex] = useState(() => Math.floor(Math.random() * QUESTIONS.length));
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const advanceTimeout = useRef<number | null>(null);

  // Freeze synchronously the instant the dead zone closes: drop any pending
  // auto-advance so no state update happens after the game goes inactive.
  // On reactivation, a round frozen mid-reveal (answer shown, advance
  // cancelled) would otherwise be stuck forever — move to a fresh question.
  useEffect(() => {
    if (!active && advanceTimeout.current !== null) {
      window.clearTimeout(advanceTimeout.current);
      advanceTimeout.current = null;
    }
    if (active && advanceTimeout.current === null) {
      setSelected((sel) => {
        if (sel !== null) setQuestionIndex((prev) => pickNextIndex(prev));
        return null;
      });
    }
  }, [active]);

  // Belt-and-suspenders cleanup on unmount (component is meant to stay
  // mounted for the app's lifetime, but this keeps it correct either way).
  useEffect(() => {
    return () => {
      if (advanceTimeout.current !== null) {
        window.clearTimeout(advanceTimeout.current);
        advanceTimeout.current = null;
      }
    };
  }, []);

  if (!active) return null;

  const question = QUESTIONS[questionIndex];

  const handleChoice = (i: number) => {
    if (selected !== null) return;
    setSelected(i);
    if (i === question.answerIndex) {
      setScore((s) => s + 1);
    }
    advanceTimeout.current = window.setTimeout(() => {
      advanceTimeout.current = null;
      setQuestionIndex((prev) => pickNextIndex(prev));
      setSelected(null);
    }, 1200);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500">breather</span>
      </div>

      <div className="px-4 pb-3 relative">
        <span className="absolute top-0 right-3 font-mono text-[11px] text-coal-600">{score} pts</span>

        <p className="text-xs text-coal-500 mb-2 pr-12">{question.prompt}</p>

        {question.code && (
          <pre className="mb-3 rounded bg-coal-950 border border-coal-800 px-3 py-2 text-xs font-mono text-coal-400 overflow-x-auto">
            {question.code}
          </pre>
        )}

        <div className="flex flex-col gap-1.5">
          {question.choices.map((choice, i) => {
            const isAnswer = i === question.answerIndex;
            const isPicked = i === selected;
            const revealed = selected !== null;

            let stateClasses = 'border-coal-800 text-coal-400 hover:border-coal-700';
            if (revealed && isAnswer) stateClasses = 'border-ember-600/50 text-ember-400/80';
            else if (revealed && isPicked && !isAnswer) stateClasses = 'border-ember-600/40 text-ember-400/70';
            else if (revealed) stateClasses = 'border-coal-800 text-coal-600';

            return (
              <button
                key={i}
                type="button"
                disabled={revealed}
                onClick={() => handleChoice(i)}
                className={`text-left text-xs rounded border px-3 py-1.5 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${stateClasses}`}
              >
                {revealed && isAnswer && <span className="mr-1.5 text-ember-500/70">+1</span>}
                {choice}
              </button>
            );
          })}
        </div>

        {selected !== null && (
          <p className="mt-2 text-[11px] text-coal-600">{question.explanation}</p>
        )}
      </div>
    </div>
  );
}

export default DeadZone;
