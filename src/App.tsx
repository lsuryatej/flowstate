// App.tsx — composition + the loop's choreography (SPEC_v0.md §4-6):
// dead zone gates the filler, working->idle triggers the focus snap, and
// completion fires exactly ONE signal (chime + XP tick + OS notification
// when unfocused). Components are presentational; state.ts owns the events.
//
// Shell anatomy ("hearth" system): header (identity + repo + key + xp),
// optional next-task strip, left = the work (reading column + statusline +
// anchored prompt bar), right = one rail surface with hairline sections
// (HUD, filler, plan, parked). The recovery card is the app's only elevated
// card: it interrupts, nothing else does.

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { open } from '@tauri-apps/plugin-dialog';
import { useAppState } from './state';
import {
  PERMISSION_MODE_LABELS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  type EffortLevel,
  type PermissionMode,
} from '../shared/uiEvents';
import type { FillerMode, ScratchpadEntry } from './types';
import TinySelect from './components/TinySelect';
import ModelPicker from './components/ModelPicker';
import RecentProjects from './components/RecentProjects';
import SessionBrowser from './components/SessionBrowser';
import EffortPicker from './components/EffortPicker';
import PermissionPrompt from './components/PermissionPrompt';
import PromptBar from './components/PromptBar';
import ResponsePane from './components/ResponsePane';
import AgentTodos from './components/AgentTodos';
import ContextMeter from './components/ContextMeter';
import PlanApprovalCard from './components/PlanApprovalCard';
import RewindMenu from './components/RewindMenu';
import MemoryPanel from './components/MemoryPanel';
import ToolHUD from './components/ToolHUD';
import Scratchpad from './components/Scratchpad';
import DeadZone from './components/DeadZone';
import XpCounter from './components/XpCounter';
import FillerToggle from './components/FillerToggle';
import NextTaskBanner from './components/NextTaskBanner';
import TaskChecklist from './components/TaskChecklist';
import ParkingLot from './components/ParkingLot';
import RecoveryCard from './components/RecoveryCard';
import { playCompletionChime, unlockAudio } from './sound';

const EMPTY_SCRATCH: ScratchpadEntry = { expect: '', verify: '', fallback: '' };
// v1.4: away longer than this = "a gap"; coming back shows the recovery card.
const RECOVERY_GAP_MS = 10 * 60_000;

function usePersisted<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (localStorage.getItem(key) as T) ?? fallback);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      localStorage.setItem(key, v);
    },
    [key],
  );
  return [value, set];
}

// A draggable divider between the work column and the loop rail. Width is
// clamped and persisted; the handle lives in <main> (not the scrolling rail)
// so it stays pinned to the seam regardless of rail scroll position.
const RAIL_MIN = 300;
const RAIL_MAX = 760;
function useRailResize(mainRef: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem('fs.railWidth'));
    return saved >= RAIL_MIN && saved <= RAIL_MAX ? saved : 360;
  });
  const resizing = useRef(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizing.current || !mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      setWidth(Math.min(RAIL_MAX, Math.max(RAIL_MIN, rect.right - e.clientX)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('fs.railWidth', String(Math.round(widthRef.current)));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [mainRef]);

  const start = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return { width, start };
}

// Dark / light / system-follow. Default is system (law 11: no mandatory config)
// — matchMedia tracks the OS live in WKWebView, no Rust needed. Sets
// documentElement[data-theme]; index.css re-points the coal/ember ramp.
type Theme = 'system' | 'dark' | 'light';
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('fs.theme') as Theme) ?? 'system',
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  const cycle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system';
      localStorage.setItem('fs.theme', next);
      return next;
    });
  }, []);
  return [theme, cycle];
}

/** Law 7: the elapsed clock, always visible next to where the user looks. */
function useElapsedLabel(turnStartedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (turnStartedAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [turnStartedAt]);
  if (turnStartedAt === null) return '0:00';
  const s = Math.max(0, Math.floor((now - turnStartedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function App() {
  const { state, deadZone, send, interrupt, sendControl, dismissNext, dismissRecovery } =
    useAppState();
  const [fillerMode, setFillerMode] = usePersisted<FillerMode>('fs.fillerMode', 'scratchpad');
  const [mutedStr, setMutedStr] = usePersisted<'yes' | 'no'>('fs.muted', 'no');
  const muted = mutedStr === 'yes';
  const [cwd, setCwd] = useState(() => localStorage.getItem('fs.cwd') ?? '');
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [scratch, setScratch] = useState<ScratchpadEntry>(EMPTY_SCRATCH);
  const [arriving, setArriving] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [scratchFocused, setScratchFocused] = useState(false);
  // Pre-turn capture: lets the user open the scratchpad while idle+empty to
  // jot intent BEFORE sending (law 1: the note often IS the first keystroke).
  const [scratchPinned, setScratchPinned] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const { width: railWidth, start: startRailResize } = useRailResize(mainRef);
  const [theme, cycleTheme] = useTheme();
  // v2: model + permission mode are user prefs (persisted); the sidecar is told
  // on boot and on every change. The pickers read from these, not from the
  // echoed session_config, so switching never races the round-trip.
  const [model, setModelPref] = usePersisted<string>('fs.model', DEFAULT_MODEL);
  const [permMode, setPermModePref] = usePersisted<PermissionMode>(
    'fs.permMode',
    DEFAULT_PERMISSION_MODE,
  );
  const [effort, setEffortPref] = usePersisted<EffortLevel>('fs.effort', DEFAULT_EFFORT);

  // Audio unlock on first gesture; notification permission once (silent, law 11).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    void invoke<boolean>('has_api_key').then(setHasKey);
    void isPermissionGranted().then((ok) => {
      if (!ok) void requestPermission();
    });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // v0.4: the completion hit. One signal per completed turn: the filler is
  // already gone (mode flipped idle in the same event batch), the pane plays
  // its arrival treatment, one chime, one XP tick. Never more.
  const lastCelebrated = useRef(0);
  useEffect(() => {
    if (state.completedTurns === 0 || state.completedTurns === lastCelebrated.current) return;
    lastCelebrated.current = state.completedTurns;
    setArriving(true);
    const id = window.setTimeout(() => setArriving(false), 700);
    if (state.lastResult?.ok && !muted) playCompletionChime();
    // v0.2b: OS notification only when the window isn't focused.
    if (!document.hasFocus()) {
      void isPermissionGranted().then((ok) => {
        if (ok)
          sendNotification({
            title: 'flowstate',
            body: state.lastResult?.ok
              ? 'done — come see the result'
              : 'the turn ended, worth a look',
          });
      });
    }
    return () => window.clearTimeout(id);
  }, [state.completedTurns, state.lastResult, muted]);

  // v0.2b: agent stuck waiting on the user (permission prompt etc.).
  useEffect(() => {
    if (!state.needsInput || document.hasFocus()) return;
    void isPermissionGranted().then((ok) => {
      if (ok) sendNotification({ title: 'flowstate', body: 'the agent needs you for a moment' });
    });
  }, [state.needsInput]);

  // v1.1 + v1.4 boot: repopulate plan/lot snapshots and ask the next-task
  // engine. The recovery CARD only shows after a real gap (fresh install or
  // quick relaunch stays quiet — the card is for lost context, not noise).
  useEffect(() => {
    const lastActive = Number(localStorage.getItem('fs.lastActive') ?? 0);
    const id = window.setTimeout(() => {
      // v3: resume this repo's last session (backfills history) before
      // anything else so the transcript is in place before the first prompt.
      void sendControl({
        type: 'resume_session',
        cwd: localStorage.getItem('fs.cwd') ?? undefined,
      });
      void sendControl({ type: 'get_recovery' });
      void sendControl({
        type: 'suggest_next_task',
        cwd: localStorage.getItem('fs.cwd') ?? undefined,
      });
      // v2: sync the persisted model + permission mode into the fresh sidecar
      // before the first turn can start.
      void sendControl({
        type: 'set_model',
        model: localStorage.getItem('fs.model') ?? DEFAULT_MODEL,
      });
      void sendControl({
        type: 'set_permission_mode',
        mode: (localStorage.getItem('fs.permMode') as PermissionMode) ?? DEFAULT_PERMISSION_MODE,
      });
      void sendControl({
        type: 'set_effort',
        level: (localStorage.getItem('fs.effort') as EffortLevel) ?? DEFAULT_EFFORT,
      });
      const savedCwd = localStorage.getItem('fs.cwd');
      if (savedCwd) void sendControl({ type: 'validate_cwd', cwd: savedCwd });
      void sendControl({ type: 'get_recent_projects' });
      if (lastActive && Date.now() - lastActive > RECOVERY_GAP_MS) setShowRecovery(true);
    }, 400); // let the sidecar finish booting
    const markActive = () => localStorage.setItem('fs.lastActive', String(Date.now()));
    const onFocus = () => {
      const last = Number(localStorage.getItem('fs.lastActive') ?? 0);
      if (last && Date.now() - last > RECOVERY_GAP_MS) {
        void sendControl({ type: 'get_recovery' });
        setShowRecovery(true);
      }
      markActive();
    };
    window.addEventListener('blur', markActive);
    window.addEventListener('beforeunload', markActive);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('blur', markActive);
      window.removeEventListener('beforeunload', markActive);
      window.removeEventListener('focus', onFocus);
    };
  }, [sendControl]);

  // v1.3: one keypress to park a thought (Cmd+J), Esc handled by the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setLotOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // v1.2: each check is its own (smaller) completion hit — chime only, no
  // arrival treatment; the XP tick animates via xpGained as usual.
  const lastCheckHit = useRef(0);
  useEffect(() => {
    if (state.checksCompleted === 0 || state.checksCompleted === lastCheckHit.current) return;
    lastCheckHit.current = state.checksCompleted;
    if (!muted) playCompletionChime();
  }, [state.checksCompleted, muted]);

  const onSend = useCallback(
    (text: string, attachments: string[] = []) => {
      const dir = cwd.trim() || undefined;
      if (dir) localStorage.setItem('fs.cwd', dir);
      // v1.2: "/plan <goal>" routes to the decomposer instead of the agent.
      const plan = /^\/plan\s+(.+)/s.exec(text);
      if (plan) {
        void sendControl({ type: 'decompose', goal: plan[1].trim(), cwd: dir });
        return;
      }
      setScratch(EMPTY_SCRATCH); // fresh capture per turn
      setScratchPinned(false); // a pre-turn pin has served its purpose
      send(text, dir, attachments.length ? attachments : undefined);
    },
    [cwd, send, sendControl],
  );

  const onAcceptNext = useCallback(
    (task: string) => {
      dismissNext();
      onSend(task);
    },
    [dismissNext, onSend],
  );

  const onPark = useCallback(
    (text: string) => void sendControl({ type: 'park', text }),
    [sendControl],
  );
  const onCheck = useCallback(
    (id: string, done: boolean) => void sendControl({ type: 'check_task', id, done }),
    [sendControl],
  );
  const onCheckParked = useCallback(
    (id: string, done: boolean) => void sendControl({ type: 'check_parked', id, done }),
    [sendControl],
  );

  // v2: model + permission mode switchers (persist, then tell the sidecar).
  const changeModel = useCallback(
    (m: string) => {
      setModelPref(m);
      void sendControl({ type: 'set_model', model: m });
    },
    [setModelPref, sendControl],
  );
  const changeMode = useCallback(
    (m: PermissionMode) => {
      setPermModePref(m);
      void sendControl({ type: 'set_permission_mode', mode: m });
    },
    [setPermModePref, sendControl],
  );
  const changeEffort = useCallback(
    (level: EffortLevel) => {
      setEffortPref(level);
      void sendControl({ type: 'set_effort', level });
    },
    [setEffortPref, sendControl],
  );

  // v2: answer a canUseTool round-trip.
  const onAllow = useCallback(
    (id: string) => void sendControl({ type: 'permission_response', id, decision: 'allow' }),
    [sendControl],
  );
  const onDeny = useCallback(
    (id: string) => void sendControl({ type: 'permission_response', id, decision: 'deny' }),
    [sendControl],
  );
  // v4: allow + persist the rule to the repo's .claude settings — asked once, never again.
  const onAllowAlways = useCallback(
    (id: string) => void sendControl({ type: 'permission_response', id, decision: 'allow_always' }),
    [sendControl],
  );

  // v3: user chose a clean slate over the resumed session.
  const onNewSession = useCallback(() => void sendControl({ type: 'new_session' }), [sendControl]);

  // v4: @-mention lookups from the prompt bar (debounced bar-side).
  const onQueryFiles = useCallback(
    (query: string) =>
      void sendControl({ type: 'list_files', cwd: cwd.trim() || undefined, query }),
    [cwd, sendControl],
  );

  // v4: plan approval — approving the plan IS the mode switch: the agent
  // leaves plan mode and starts building with edits auto-accepted. The picker
  // reflects it (visible, never silent). Keep planning = deny; the agent stays
  // in plan mode and the user says what to change.
  const onApprovePlan = useCallback(
    (id: string) => {
      void sendControl({ type: 'permission_response', id, decision: 'allow' });
      changeMode('acceptEdits');
    },
    [sendControl, changeMode],
  );
  const onKeepPlanning = useCallback(
    (id: string) => void sendControl({ type: 'permission_response', id, decision: 'deny' }),
    [sendControl],
  );

  // v4: rewind to a checkpoint (files + conversation; nothing is deleted).
  const onRewind = useCallback(
    (id: string) => void sendControl({ type: 'rewind', id }),
    [sendControl],
  );

  // v4: CLAUDE.md memory panel.
  const onLoadMemory = useCallback(
    () => void sendControl({ type: 'get_memory', cwd: cwd.trim() || undefined }),
    [cwd, sendControl],
  );
  const onSaveMemory = useCallback(
    (scope: 'project' | 'global', content: string) =>
      void sendControl({ type: 'save_memory', cwd: cwd.trim() || undefined, scope, content }),
    [cwd, sendControl],
  );

  // v3: switch to a recently-used project — mirrors what happens when the
  // user sets a repo path and reboots the per-repo context.
  const onPickProject = useCallback(
    (dir: string) => {
      setCwd(dir);
      localStorage.setItem('fs.cwd', dir);
      void sendControl({ type: 'validate_cwd', cwd: dir });
      void sendControl({ type: 'resume_session', cwd: dir });
      void sendControl({ type: 'get_recovery' });
      void sendControl({ type: 'suggest_next_task', cwd: dir });
      void sendControl({ type: 'get_memory', cwd: dir }); // v4: refresh CLAUDE.md for the new repo
    },
    [sendControl],
  );

  // v3: session browser — parent refreshes the list on open, then picking a
  // session restarts the sidecar (one sidecar = one session, cannot switch
  // in-process) before re-syncing config and arming the specific resume.
  const onOpenSessions = useCallback(() => {
    void sendControl({ type: 'list_sessions', cwd: localStorage.getItem('fs.cwd') ?? undefined });
  }, [sendControl]);

  const onPickSession = useCallback(
    (sessionId: string) => {
      const dir = localStorage.getItem('fs.cwd') ?? undefined;
      void (async () => {
        await invoke('restart_session'); // fresh sidecar: one sidecar = one session
        // give the fresh sidecar a beat to boot before control messages
        await new Promise((r) => setTimeout(r, 500));
        // re-sync config the boot effect normally sends
        void sendControl({
          type: 'set_model',
          model: localStorage.getItem('fs.model') ?? DEFAULT_MODEL,
        });
        void sendControl({
          type: 'set_permission_mode',
          mode: (localStorage.getItem('fs.permMode') as PermissionMode) ?? DEFAULT_PERMISSION_MODE,
        });
        void sendControl({
          type: 'set_effort',
          level: (localStorage.getItem('fs.effort') as EffortLevel) ?? DEFAULT_EFFORT,
        });
        void sendControl({ type: 'resume_specific', sessionId, cwd: dir });
      })();
    },
    [sendControl],
  );

  // v2: native folder picker -> set + validate the repo path.
  const pickFolder = useCallback(async () => {
    const picked = await open({ directory: true, multiple: false, title: 'Choose repo folder' });
    if (typeof picked === 'string') {
      setCwd(picked);
      localStorage.setItem('fs.cwd', picked);
      void sendControl({ type: 'validate_cwd', cwd: picked });
    }
  }, [sendControl]);

  // v2: debounce path validation as the user types (blank clears the status).
  useEffect(() => {
    const dir = cwd.trim();
    if (!dir) return;
    const id = window.setTimeout(() => void sendControl({ type: 'validate_cwd', cwd: dir }), 500);
    return () => window.clearTimeout(id);
  }, [cwd, sendControl]);

  const saveKey = useCallback(() => {
    const key = keyDraft.trim();
    if (!key) return;
    void invoke('set_api_key', { key }).then(() => {
      setHasKey(true);
      setKeyDraft('');
      setKeyOpen(false);
    });
  }, [keyDraft]);

  const removeKey = useCallback(() => {
    void invoke('clear_api_key').then(() => {
      setHasKey(false);
      setKeyDraft('');
      setKeyOpen(false);
    });
  }, []);

  // Open the scratchpad while idle (pre-turn capture) and land the cursor in
  // the first field — the affordance IS the first keystroke (law 1).
  const openScratch = useCallback(() => {
    setScratchPinned(true);
    window.setTimeout(() => document.getElementById('fs-scratchpad-expect')?.focus(), 50);
  }, []);

  // The scratchpad is capture, not distraction (laws 4/5/6): it must survive
  // the turn ending so a mid-thought note stays visible and editable instead of
  // snapping shut. It stays open while the agent works, while it holds a
  // thought, or while focused — and collapses only when emptied or on the next
  // send. The game, being a pure distraction, still yields the instant work is
  // ready (law 3).
  const hasScratch = Boolean(scratch.expect || scratch.verify || scratch.fallback);
  const scratchVisible =
    fillerMode === 'scratchpad' && (deadZone || hasScratch || scratchFocused || scratchPinned);
  const gameVisible = deadZone && fillerMode === 'game';
  const working = state.mode === 'working';
  const elapsed = useElapsedLabel(state.turnStartedAt);
  const repoName = cwd.trim()
    ? (cwd.trim().split('/').filter(Boolean).pop() ?? cwd.trim())
    : 'this repo';

  return (
    <div className="flex max-h-[100dvh] min-h-[100dvh] flex-col bg-coal-950 font-sans text-coal-300 antialiased">
      {/* warm film grain over the whole surface (fixed, non-interactive) */}
      <div className="fs-grain" aria-hidden="true" />

      {/* top bar: identity + repo + key + xp. Nothing else earns this row. */}
      <header className="flex h-11 shrink-0 items-center gap-4 border-b border-coal-800/70 px-4">
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${working ? 'fs-pulse-dot bg-ember-500' : 'bg-coal-700'}`}
          />
          <span className="font-mono text-xs tracking-tight text-coal-300">flowstate</span>
        </span>

        <span className="flex items-center gap-1.5">
          <input
            className="w-60 border-b border-transparent bg-transparent px-0 py-0.5 font-mono text-[11px] text-coal-400 outline-none transition-colors duration-200 placeholder:text-coal-600 hover:border-coal-800 focus:border-coal-700"
            value={cwd}
            onChange={(e) => setCwd(e.currentTarget.value)}
            placeholder="repo path (blank = this repo)"
            spellCheck={false}
          />
          {cwd.trim() && state.cwdStatus && (
            <span
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                state.cwdStatus.valid ? 'bg-emerald-500/70' : 'bg-red-500/70'
              }`}
              title={
                state.cwdStatus.valid
                  ? state.cwdStatus.resolved
                  : (state.cwdStatus.message ?? 'path not found')
              }
            />
          )}
          <button
            type="button"
            onClick={() => void pickFolder()}
            aria-label="browse for repo folder"
            title="Browse for repo folder"
            className="p-1 text-coal-600 transition-colors duration-200 hover:text-coal-300 active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <RecentProjects items={state.recentProjects} onPick={onPickProject} />
          <SessionBrowser
            items={state.sessionList}
            activeSessionId={state.sessionId}
            onOpen={onOpenSessions}
            onPick={onPickSession}
          />
        </span>

        <span className="flex-1" />

        {/* v2: model + effort + permission mode switchers */}
        <ModelPicker value={model} onChange={changeModel} />
        <EffortPicker value={effort} onChange={changeEffort} />
        <TinySelect
          ariaLabel="permission mode"
          title="Ask · Accept edits · Plan · Auto"
          value={permMode}
          options={(Object.keys(PERMISSION_MODE_LABELS) as PermissionMode[]).map((m) => ({
            value: m,
            label: PERMISSION_MODE_LABELS[m],
          }))}
          onChange={(v) => changeMode(v as PermissionMode)}
        />

        {state.auth && (
          <span
            className="flex items-center gap-1 font-mono text-[11px] text-coal-500"
            title={
              state.auth.method === 'subscription'
                ? `Signed in with your Claude subscription${state.auth.email ? ` (${state.auth.email})` : ''}${state.auth.plan ? ` · ${state.auth.plan}` : ''}`
                : state.auth.method === 'api_key'
                  ? 'Authenticated with an API key (usage-billed). Remove the key to fall back to a Claude subscription login, if you have one.'
                  : 'Not signed in. Run `claude` then /login in a terminal, or paste an API key.'
            }
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                state.auth.method === 'subscription'
                  ? 'bg-emerald-500/70'
                  : state.auth.method === 'api_key'
                    ? 'bg-coal-500'
                    : 'bg-ember-500/70'
              }`}
            />
            {state.auth.method === 'subscription'
              ? (state.auth.plan ?? 'subscription')
              : state.auth.method === 'api_key'
                ? 'api key'
                : 'not signed in'}
          </span>
        )}
        {keyOpen ? (
          <span className="flex items-center gap-1.5">
            <input
              type="password"
              className="w-48 rounded-md border border-coal-800 bg-coal-850 px-2 py-1 font-mono text-xs text-coal-200 outline-none focus:border-ember-500/50"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.currentTarget.value)}
              placeholder={hasKey ? 'paste new key to replace' : 'sk-ant-…'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveKey();
                if (e.key === 'Escape') setKeyOpen(false);
              }}
              autoFocus
            />
            <button
              className="rounded-md px-2 py-1 text-xs text-ember-400 transition-colors duration-200 hover:bg-ember-500/10"
              onClick={saveKey}
            >
              save
            </button>
            {hasKey && (
              <button
                className="rounded-md px-2 py-1 text-xs text-coal-500 transition-colors duration-200 hover:text-coal-200"
                onClick={removeKey}
                title="Delete the key from the keychain; the app falls back to your environment / claude login"
              >
                remove
              </button>
            )}
            <button
              className="rounded-md px-2 py-1 text-xs text-coal-500 transition-colors duration-200 hover:text-coal-200"
              onClick={() => setKeyOpen(false)}
            >
              cancel
            </button>
          </span>
        ) : hasKey ? (
          // Key set: an unambiguous status, not an action prompt. Green + check
          // so it never reads as "unset"; clicking opens the field to replace.
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] text-emerald-400/80 transition-colors duration-200 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-ember-500/60"
            onClick={() => setKeyOpen(true)}
            title="API key is stored in the OS keychain and never leaves this machine. Click to replace it."
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            key set
          </button>
        ) : (
          <button
            className="rounded-md px-2 py-1 font-mono text-[11px] text-ember-400 transition-colors duration-200 hover:bg-ember-500/10 focus-visible:outline-2 focus-visible:outline-ember-500/60"
            onClick={() => setKeyOpen(true)}
            title="Paste your Anthropic API key. Stored in the OS keychain, never leaves this machine."
          >
            set api key
          </button>
        )}

        {/* theme: system-follow by default; one click cycles system → dark → light */}
        <button
          type="button"
          onClick={cycleTheme}
          aria-label={`theme: ${theme}`}
          title={`Theme: ${theme} (click to cycle)`}
          className="p-1 text-coal-600 transition-colors duration-200 hover:text-coal-300 active:scale-[0.98]"
        >
          {theme === 'system' ? (
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="4" width="18" height="12" rx="1.5" />
              <path d="M8 20h8M12 16v4" strokeLinecap="round" />
            </svg>
          ) : theme === 'dark' ? (
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        <XpCounter total={state.xpTotal} gained={state.xpGained} />
      </header>

      {/* v1.1: the ONE suggested task */}
      {state.nextTask && (
        <NextTaskBanner
          task={state.nextTask.task}
          reason={state.nextTask.reason}
          onAccept={onAcceptNext}
          onDismiss={dismissNext}
        />
      )}

      {/* main: the work on the left, the loop rail on the right. The rail width
          is user-draggable via the seam handle below (law 12: the user tunes
          the surface to what they need to see). */}
      <main
        ref={mainRef}
        className="relative grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `minmax(0, 1fr) ${railWidth}px` }}
      >
        <section className="flex min-h-0 flex-col px-5 pb-4 pt-3">
          {state.resumed && (
            <div className="mx-auto mb-2 flex w-full max-w-[68ch] items-center justify-between font-mono text-[11px] text-coal-500">
              <span>· resumed from your last session</span>
              <button
                type="button"
                onClick={onNewSession}
                className="rounded px-1.5 py-0.5 text-coal-500 transition-colors duration-200 hover:text-ember-400"
              >
                start fresh
              </button>
            </div>
          )}
          <ResponsePane
            chat={state.chat}
            arriving={arriving}
            lastResult={state.lastResult}
            error={state.error}
          />

          {/* statusline + prompt share the reading measure so the column reads
              as one object (state + elapsed per law 7; repo on the right). */}
          <div className="mx-auto w-full max-w-[68ch]">
            <div className="flex items-center justify-between px-1 py-1.5 font-mono text-[11px]">
              {working ? (
                <span className="flex items-center gap-2 text-ember-500">
                  <span className="fs-pulse-dot inline-block h-1 w-1 rounded-full bg-ember-500" />
                  {state.currentTool ? state.currentTool.tool.toLowerCase() : 'thinking'}
                  <span className="tabular-nums text-ember-400">{elapsed}</span>
                  {/* v4: a settings.json hook is running — real activity, named */}
                  {state.hookActivity && (
                    <span className="text-coal-600">hook: {state.hookActivity}</span>
                  )}
                </span>
              ) : (
                <span className="text-coal-600">idle</span>
              )}
              <span className="flex items-center gap-3">
                {/* v4: context meter + rewind live where the eye already rests */}
                <ContextMeter usage={state.contextUsage} compactNote={state.compactNote} />
                <RewindMenu
                  checkpoints={state.checkpoints}
                  rewindResult={state.rewindResult}
                  onRewind={onRewind}
                />
                <span className="text-coal-600">{repoName}</span>
              </span>
            </div>

            {/* v4: the agent finished planning and asks to build — the plan is
                the decision surface, right where the eye already is. */}
            {state.planReady && (
              <PlanApprovalCard
                plan={state.planReady.plan}
                onApprove={() => onApprovePlan(state.planReady!.id)}
                onKeepPlanning={() => onKeepPlanning(state.planReady!.id)}
              />
            )}

            {/* v2: the agent is parked in canUseTool — answer before the turn
                can continue. Only the oldest pending ask is shown. */}
            {state.permissionAsks.length > 0 && (
              <PermissionPrompt
                ask={state.permissionAsks[0]}
                pending={state.permissionAsks.length}
                onAllow={onAllow}
                onAllowAlways={onAllowAlways}
                onDeny={onDeny}
              />
            )}

            <PromptBar
              working={working}
              onSend={onSend}
              onInterrupt={() => void interrupt()}
              commands={state.commands}
              fileList={state.fileList}
              onQueryFiles={onQueryFiles}
            />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-coal-800/70 bg-coal-900/40">
          {/* v1.4: context recovery, only after a real gap. The one card. */}
          {showRecovery && state.recovery && (
            <div className="p-3">
              <RecoveryCard
                where={state.recovery.where}
                next={state.recovery.next}
                blocked={state.recovery.blocked}
                onDismiss={() => {
                  setShowRecovery(false);
                  dismissRecovery();
                }}
              />
            </div>
          )}

          <ToolHUD
            mode={state.mode}
            currentTool={state.currentTool}
            tools={state.tools}
            turnStartedAt={state.turnStartedAt}
          />

          {/* filler config: persistent one-click toggle (law 13) */}
          <div className="fs-hairline-t flex items-center justify-between px-4 py-1.5">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
                dead zone
              </span>
              {/* pre-turn capture: only offered when the scratchpad is chosen
                  but collapsed — one click to jot intent before sending */}
              {fillerMode === 'scratchpad' && !scratchVisible && (
                <button
                  type="button"
                  onClick={openScratch}
                  className="rounded px-1 py-0.5 font-mono text-[10px] text-coal-600 transition-colors duration-200 hover:text-ember-400"
                  title="Jot what you expect before you send"
                >
                  + note
                </button>
              )}
            </span>
            <FillerToggle
              mode={fillerMode}
              onChange={setFillerMode}
              muted={muted}
              onToggleMute={() => setMutedStr(muted ? 'no' : 'yes')}
            />
          </div>

          {/* Scratchpad (capture): mounted always, persists past the turn so a
              mid-thought note is never snapped away (laws 4/5/6). Focus/blur
              keep it open while the user is in it; content keeps it open after.
              Collapses only when empty + unfocused + idle, or on the next send. */}
          <div
            className={`overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              scratchVisible ? 'opacity-100' : 'pointer-events-none h-0 opacity-0'
            }`}
            onFocus={() => setScratchFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                setScratchFocused(false);
            }}
          >
            <Scratchpad visible={scratchVisible} value={scratch} onChange={setScratch} />
          </div>

          {/* Game (distraction): yields the instant work is ready (laws 3/4).
              No persistence — you don't keep playing after the turn ends. */}
          <div
            className={`overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              gameVisible ? 'opacity-100' : 'pointer-events-none h-0 opacity-0'
            }`}
          >
            <DeadZone active={gameVisible} />
          </div>

          {state.needsInput && (
            <p className="fs-hairline-t flex items-center gap-2 px-4 py-2.5 text-xs text-ember-400">
              <span className="fs-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-ember-400" />
              {state.needsInput}
            </p>
          )}

          {/* v4: the agent's own todo list (TodoWrite) — what IT is doing,
              distinct from the user's decomposed plan below. */}
          {state.todos.length > 0 && (
            <div className="fs-hairline-t">
              <AgentTodos items={state.todos} />
            </div>
          )}

          {/* v1.2: the decomposed checklist */}
          {state.plan && (
            <div className="fs-hairline-t">
              <TaskChecklist goal={state.plan.goal} items={state.plan.items} onCheck={onCheck} />
            </div>
          )}

          {/* v1.3: parking lot (Cmd+J opens capture) */}
          {(lotOpen || state.parkingLot.length > 0) && (
            <div className="fs-hairline-t">
              <ParkingLot
                open={lotOpen}
                items={state.parkingLot}
                onPark={onPark}
                onClose={() => setLotOpen(false)}
                onCheck={onCheckParked}
              />
            </div>
          )}

          {/* v4: CLAUDE.md memory — one quiet collapsed row; expand to edit
              what the agent reads at every session start. */}
          <div className="fs-hairline-t">
            <MemoryPanel memory={state.memory} onLoad={onLoadMemory} onSave={onSaveMemory} />
          </div>

          <span className="flex-1" />

          {!state.plan && (
            <p className="px-4 pb-3 font-mono text-[10px] text-coal-600">
              /plan &lt;goal&gt; builds a checklist &middot; &#8984;J parks a thought
            </p>
          )}
        </aside>

        {/* resize seam: sits over the rail's left border, independent of its
            scroll. Drag to widen/narrow the loop rail. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="resize panels"
          title="Drag to resize panels"
          onPointerDown={startRailResize}
          onDoubleClick={() => {
            localStorage.setItem('fs.railWidth', '360');
            window.location.reload();
          }}
          className="group absolute top-0 z-30 h-full w-2 -translate-x-1/2 cursor-col-resize"
          style={{ right: railWidth }}
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors duration-150 group-hover:bg-ember-500/40" />
        </div>
      </main>
    </div>
  );
}

export default App;
