/**
 * Packet Descent: übersetzt den Engine-Trace in Animations-Frames.
 * Jeder Frame markiert eine Tabellenzeile; gescheiterte Felder bleiben
 * markiert (das IST die First-Match-Didaktik). Skippbar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TraceStep, Verdict } from '../../engine';
import type { RowHighlight } from '../components/PolicyTable';

export interface DescentFrame {
  row: number; // Policy-ID; 0 = Implicit-Deny-Zeile
  highlight: RowHighlight;
}

export function framesFromTrace(trace: TraceStep[]): DescentFrame[] {
  const frames: DescentFrame[] = [];
  for (const step of trace) {
    switch (step.kind) {
      case 'policy-skipped':
        frames.push({ row: step.policyId, highlight: { state: 'skipped' } });
        break;
      case 'policy-no-match':
        frames.push({
          row: step.policyId,
          highlight: { state: 'failed', failedField: step.failedField },
        });
        break;
      case 'policy-match':
        frames.push({
          row: step.policyId,
          highlight: { state: step.action === 'accept' ? 'matched-accept' : 'matched-deny' },
        });
        break;
      case 'implicit-deny':
      case 'no-route':
        frames.push({ row: 0, highlight: { state: 'implicit-hit' } });
        break;
      default:
        break; // dnat/route haben keine Tabellenzeile
    }
  }
  return frames;
}

export function highlightsUpTo(frames: DescentFrame[], index: number): Map<number, RowHighlight> {
  const map = new Map<number, RowHighlight>();
  frames.slice(0, index + 1).forEach((frame) => map.set(frame.row, frame.highlight));
  return map;
}

interface DescentState {
  running: boolean;
  highlights: Map<number, RowHighlight>;
  chipRow: number | null;
  start(): void;
  skip(): void;
  reset(): void;
}

const FRAME_MS = 650;

export function useDescent(
  verdict: Verdict | null,
  reducedMotion: boolean,
  onDone: () => void,
): DescentState {
  const frames = useMemo(() => (verdict ? framesFromTrace(verdict.trace) : []), [verdict]);
  const [index, setIndex] = useState<number>(-2); // -2 = idle, -1 = gestartet (Chip über Tabelle)
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const running = index >= -1 && index < frames.length;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      const next = index + 1;
      setIndex(next);
      if (next >= frames.length) doneRef.current();
    }, FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [index, running, frames.length]);

  const start = useCallback(() => {
    if (reducedMotion || frames.length === 0) {
      setIndex(frames.length);
      doneRef.current();
      return;
    }
    setIndex(-1);
  }, [reducedMotion, frames.length]);

  const skip = useCallback(() => {
    setIndex(frames.length);
    doneRef.current();
  }, [frames.length]);

  const reset = useCallback(() => setIndex(-2), []);

  const visibleIndex = Math.min(index, frames.length - 1);
  const highlights = useMemo(
    () => (index <= -1 ? new Map<number, RowHighlight>() : highlightsUpTo(frames, visibleIndex)),
    [frames, index, visibleIndex],
  );
  const chipRow = index >= 0 && frames.length > 0 ? (frames[visibleIndex]?.row ?? null) : null;

  return { running, highlights, chipRow, start, skip, reset };
}
