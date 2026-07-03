// ParkingLot — v1.3 stray-thought capture (REQUIREMENTS v1.3, IDEOLOGY law
// 5: capture, don't switch). Parent owns open/close (global hotkey); this
// component only renders the capture row when told to and never invents its
// own trigger. Lives in a 340px sidebar, so stays compact.

import { useEffect, useRef, useState } from 'react';
import type { ParkedItem } from '../../shared/uiEvents';

interface ParkingLotProps {
  open: boolean;
  items: ParkedItem[];
  onPark: (text: string) => void;
  onClose: () => void;
}

function ago(ts: number): string {
  const diffMs = Date.now() - ts;
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ParkingLot({ open, items, onPark, onClose }: ParkingLotProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const text = draft.trim();
      if (text) {
        onPark(text);
        setDraft('');
      }
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const sorted = [...items].sort((a, b) => b.ts - a.ts);

  return (
    <div className="w-[340px]">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500">parked</span>
        {items.length > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-coal-500">{items.length}</span>
        )}
      </div>

      <div className="px-4 pb-3 space-y-2">
        {open && (
          <div className="space-y-1">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="park this thought..."
              className="w-full bg-coal-850 border border-coal-800 rounded-md px-2 py-1.5 text-sm text-coal-200 placeholder:text-coal-600 outline-none focus:border-ember-500/50 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            />
            <div className="font-mono text-[10px] text-coal-600">enter parks · esc closes</div>
          </div>
        )}

        {sorted.length > 0 ? (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {sorted.map((item) => (
              <li key={item.ts} className="border-b border-coal-800/60 pb-1.5 last:border-b-0 last:pb-0">
                <div className="text-sm text-coal-300 truncate">{item.text}</div>
                <div className="font-mono text-[11px] text-coal-600 truncate">
                  {item.task ? `${item.task} · ` : ''}
                  {ago(item.ts)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-coal-600">nothing parked</div>
        )}
      </div>
    </div>
  );
}

export default ParkingLot;
