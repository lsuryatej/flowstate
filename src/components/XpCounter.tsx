// XpCounter — small, quiet reward signal (IDEOLOGY law 9: the dopamine layer
// is a hook, not a foundation — keep it small and swappable). Floats a "+N"
// tick once per gain and lets it fade.

import { useEffect, useState } from 'react';
import type { XpCounterProps } from '../types';

interface Tick {
  key: number;
  amount: number;
}

let tickSeq = 0;

function XpCounter({ total, gained }: XpCounterProps) {
  const [tick, setTick] = useState<Tick | null>(null);

  useEffect(() => {
    if (gained === null) return;
    setTick({ key: ++tickSeq, amount: gained });
    const id = window.setTimeout(() => setTick(null), 800);
    return () => window.clearTimeout(id);
  }, [gained]);

  return (
    <div className="relative inline-flex items-center font-mono text-xs text-coal-500">
      <span>
        xp <span className="text-coal-200">{total}</span>
      </span>
      {tick && (
        <span key={tick.key} className="fs-xp-tick pointer-events-none absolute left-1/2 -top-1 text-ember-400">
          +{tick.amount}
        </span>
      )}
    </div>
  );
}

export default XpCounter;
