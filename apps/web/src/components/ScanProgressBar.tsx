"use client";
import React, { useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { toast } from 'sonner';
import { useBackgroundJobsStore } from '../store/backgroundJobsStore';
import { Loader2, Minimize2, Maximize2, XCircle, CheckCircle2 } from 'lucide-react';

// ─── Visual phase machine ────────────────────────────────────────────────────
//  discovering → we know a scan started but don't have the total count yet
//  parsing     → backend sent 'discovering' event with total; progress is determinate
//  completed   → scan finished
//  aborted     → user cancelled
type VisualPhase = 'discovering' | 'parsing' | 'completed' | 'aborted';

interface ScanProgressBarProps {
  projectId: string;
}

export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({ projectId }) => {
  const [phase, setPhase] = useState<VisualPhase>('discovering');
  const [statusText, setStatusText] = useState('Discovering files...');
  const [currentPercentage, setCurrentPercentage] = useState(0);
  const totalFilesRef = useRef<number>(0);
  const lastPercentageRef = useRef<number>(0);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const { activeScans, setScanStatus, requestAbort, toggleMinimize, clearScan } =
    useBackgroundJobsStore();
  const scanJob = activeScans[projectId];

  const localAbortControllerRef = useRef<AbortController | null>(null);

  // ── Main SSE connection ─────────────────────────────────────────────────────
  useEffect(() => {
    if (scanJob?.status !== 'scanning') return;

    localAbortControllerRef.current = new AbortController();

    // React 18 StrictMode guard — 50ms debounce prevents double-mount socket leak
    const timerId = setTimeout(startScanStream, 50);

    async function startScanStream() {
      try {
        await fetchEventSource(
          `http://localhost:8000/api/v1/projects/${projectId}/scan/stream`,
          {
            method: 'GET',
            signal: localAbortControllerRef.current!.signal,

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async onmessage(event: any) {
              try {
                const data = JSON.parse(event.data);

                if (data.type === 'discovering') {
                  // Backend finished the discovery phase — we now know the total
                  totalFilesRef.current = data.total ?? 0;
                  setPhase('discovering'); // still in discovery visually until first progress
                  setStatusText(
                    `Found ${data.total} files — starting analysis...`
                  );
                  return;
                }

                if (data.type === 'progress') {
                  const parsed: number = data.parsed ?? 0;
                  const total: number = data.total ?? totalFilesRef.current ?? 0;

                  if (total > 0) {
                    // Switch to determinate mode on the first progress event
                    if (phase === 'discovering') setPhase('parsing');

                    const pct = Math.min(100, (parsed / total) * 100);

                    // Visual layer — bypass React for 60fps bar updates
                    if (progressBarRef.current) {
                      progressBarRef.current.style.width = `${pct}%`;
                    }

                    // Semantic layer — throttle React re-renders to integer boundaries
                    const intPct = Math.floor(pct);
                    if (intPct > lastPercentageRef.current) {
                      lastPercentageRef.current = intPct;
                      setCurrentPercentage(intPct);
                      setStatusText(`Analyzing... ${intPct}% (${parsed}/${total} files)`);
                    }
                  } else {
                    // total unknown — indeterminate fallback
                    setStatusText(`Analyzing... ${parsed} files`);
                  }
                  return;
                }

                if (data.type === 'completed') {
                  localAbortControllerRef.current?.abort();
                  setPhase('completed');
                  setCurrentPercentage(100);
                  setStatusText(`Done — ${data.parsed ?? ''} files analyzed`);
                  if (progressBarRef.current) {
                    progressBarRef.current.style.width = '100%';
                  }
                  setScanStatus(projectId, 'completed');
                  toast.success('Codebase analysis complete');
                  setTimeout(() => clearScan(projectId), 3000);
                }
              } catch {
                // JSON parse error — swallow silently
              }
            },

            onclose() {
              // Server closed the stream — throw to prevent zombie reconnects
              throw new Error('__stream_closed__');
            },

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onerror(err: any) {
              console.error('SSE error:', err);
              throw err; // kills the reconnect loop
            },
          }
        );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        const isSilent =
          err?.name === 'AbortError' || err?.message === '__stream_closed__';
        if (!isSilent) {
          toast.error('Connection error during scan');
          setScanStatus(projectId, 'failed');
        }
      }
    }

    return () => {
      clearTimeout(timerId);
      localAbortControllerRef.current?.abort();
    };
    // intentionally omit phase from deps — it's derived from events, not a trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scanJob?.status, setScanStatus, clearScan]);

  // ── Declarative abort watcher ───────────────────────────────────────────────
  useEffect(() => {
    if (scanJob?.status === 'abort_requested') {
      localAbortControllerRef.current?.abort();
      // eslint-disable-next-line
      setPhase('aborted');
      setScanStatus(projectId, 'aborted');
      toast.info('Scan cancelled');
      setTimeout(() => clearScan(projectId), 2000);
    }
  }, [scanJob?.status, projectId, setScanStatus, clearScan]);

  if (!scanJob) return null;

  const isIndeterminate = phase === 'discovering';
  const isFinished = phase === 'completed' || phase === 'aborted';

  // ── Minimized pill ──────────────────────────────────────────────────────────
  if (scanJob.isMinimized) {
    return (
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full shadow-lg pointer-events-auto">
        {isFinished ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        )}
        <span className="text-xs font-mono text-slate-300 w-16 truncate text-right">
          {isIndeterminate ? '…' : `${currentPercentage}%`}
        </span>
        <button
          onClick={() => toggleMinimize(projectId)}
          className="ml-1 hover:bg-slate-800 p-1 rounded-full text-slate-400 hover:text-white transition-colors"
          title="Expand"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        {!isFinished && (
          <button
            onClick={() => requestAbort(projectId)}
            className="hover:bg-slate-800 p-1 rounded-full text-red-400 hover:text-red-300 transition-colors"
            title="Cancel scan"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  // ── Full card ───────────────────────────────────────────────────────────────
  return (
    <div className="w-80 bg-slate-900 border border-slate-700 rounded-lg p-4 shadow-2xl pointer-events-auto flex flex-col gap-3">
      {/* Header row */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isFinished ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
          )}
          <span className="text-sm font-mono text-slate-300 truncate">
            {statusText}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => toggleMinimize(projectId)}
            className="hover:bg-slate-800 p-1.5 rounded text-slate-400 hover:text-white transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          {!isFinished && (
            <button
              onClick={() => requestAbort(projectId)}
              className="hover:bg-slate-800 p-1.5 rounded text-red-400 hover:text-red-300 transition-colors"
              title="Cancel scan"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress track */}
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        {isIndeterminate ? (
          /* Indeterminate shimmer — CSS animation, zero JS */
          <div className="h-full w-full bg-gradient-to-r from-slate-800 via-blue-500 to-slate-800 animate-[shimmer_1.5s_ease-in-out_infinite] bg-[length:200%_100%]" />
        ) : (
          /* Determinate bar — bypasses React for 60fps */
          <div
            ref={progressBarRef}
            className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-none"
            style={{ width: `${currentPercentage}%` }}
          />
        )}
      </div>

      {/* Phase badge */}
      {!isFinished && (
        <div className="flex justify-end">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
            isIndeterminate
              ? 'bg-slate-700 text-slate-400'
              : 'bg-blue-950 text-blue-400'
          }`}>
            {isIndeterminate ? 'DISCOVERING' : 'PARSING'}
          </span>
        </div>
      )}
    </div>
  );
};
