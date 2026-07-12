/**
 * Objekt-Chips mit Inspektion (FortiGate × CK3-Tooltips wie in QuestHall):
 * Hover/Fokus zeigt das Popover, Klick/Tap LOCKT es (bleibt offen, bekommt ✕;
 * Escape oder Klick außerhalb schließt). Im gelockten Popover sind Gruppen-
 * Mitglieder selbst hoverbar — verschachtelte Inspektion bis zum Wert.
 *
 * Das Popover wird per Portal (fixed, an der Chip-Position) gerendert, damit
 * scrollende/overflow-Container (Spaltentabelle) es nicht abschneiden.
 */
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig } from '../../engine';
import { resolveObjectInfo, type ObjectField, type ObjectInfo } from '../../game/objectInfo';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

type OpenState = 'closed' | 'hover' | 'locked';
type Pos = { left: number; top: number };

const POPOVER_BASE =
  'block w-max max-w-[300px] cursor-default rounded-panel border bg-bg px-3 py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.5)]';

function PortalPopover({
  pos,
  locked,
  popRef,
  onClose,
  children,
}: {
  pos: Pos;
  locked: boolean;
  popRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotionPref();
  return createPortal(
    <motion.div
      ref={popRef}
      role="tooltip"
      initial={reducedMotion ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 60 }}
      className={`${POPOVER_BASE} ${locked ? 'border-claw/60' : 'border-line'}`}
    >
      {locked && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="close"
          className="absolute right-1 top-0.5 px-1 text-[11px] text-dim hover:text-ink"
        >
          ✕
        </button>
      )}
      {children}
    </motion.div>,
    document.body,
  );
}

/** Klick/Tap ausserhalb von Anker UND Popover schliesst. */
function useLockedClickOutside(
  active: boolean,
  anchor: React.RefObject<HTMLElement>,
  pop: React.RefObject<HTMLElement>,
  close: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || pop.current?.contains(t)) return;
      close();
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [active, anchor, pop, close]);
}

function ObjectInfoBody({
  info,
  network,
  field,
  nested,
}: {
  info: ObjectInfo;
  network: NetworkConfig;
  field: ObjectField;
  /** true = Mitglieder-Zeilen sind selbst hoverbar (CK3-Verschachtelung) */
  nested: boolean;
}) {
  const { t } = useTranslation();
  // Mitglieder von Zonen sind Interfaces — sonst erbt das Kind das Eltern-Feld
  const childField: ObjectField = info.kindKey === 'zone' ? 'srcintf' : field;
  return (
    <>
      <span className="flex items-baseline justify-between gap-3 pr-3">
        <span className="font-mono text-[11px] font-bold text-ink">{info.name}</span>
        <span className="text-[9px] uppercase tracking-wide text-dim">
          {t(`objectInfo.kind.${info.kindKey}`)}
        </span>
      </span>
      {info.value && (
        <span className="mt-0.5 block font-mono text-[11px] text-trace">
          {info.kindKey === 'iface' ? t('objectInfo.inZone', { zone: info.value }) : info.value}
        </span>
      )}
      {info.lines.length > 0 && (
        <span className="mt-1 block border-t border-line/60 pt-1">
          {info.lines.map((line, i) => (
            <span
              key={`${line.name}-${i}`}
              className="flex items-baseline justify-between gap-3 py-px font-mono text-[11px]"
              style={{ paddingLeft: `${line.depth * 12}px` }}
            >
              <span className={line.group ? 'text-warn' : 'text-ink/90'}>
                {line.group ? '▸ ' : ''}
                {nested ? (
                  <ObjectValue network={network} field={childField} name={line.name} />
                ) : (
                  line.name
                )}
              </span>
              {line.detail && <span className="text-dim">{line.detail}</span>}
            </span>
          ))}
        </span>
      )}
      {info.noteKey && (
        <span className="mt-1 block max-w-[240px] text-[10px] leading-snug text-dim">
          {t(`objectInfo.note.${info.noteKey}`)}
        </span>
      )}
    </>
  );
}

/** Ein hover-/lockbarer Objektname (auch verschachtelt im Popover nutzbar). */
function ObjectValue({
  network,
  field,
  name,
}: {
  network: NetworkConfig;
  field: ObjectField;
  name: string;
}) {
  const [state, setState] = useState<OpenState>('closed');
  const [pos, setPos] = useState<Pos | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useLockedClickOutside(state === 'locked', anchorRef, popRef, () => setState('closed'));

  const open = state !== 'closed';
  const info = useMemo(
    () => (open ? resolveObjectInfo(network, field, name) : null),
    [open, network, field, name],
  );
  const inspectable = !(field === 'srcintf' || field === 'dstintf') || name !== 'any';
  if (!inspectable) return <span className="font-mono text-[11px]">{name}</span>;

  const openAt = (next: OpenState) => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4 });
    setState(next);
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => state === 'closed' && openAt('hover')}
      onMouseLeave={() => state === 'hover' && setState('closed')}
      onFocus={() => state === 'closed' && openAt('hover')}
      onBlur={() => state === 'hover' && setState('closed')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setState('closed');
        }
      }}
    >
      <span
        ref={anchorRef}
        tabIndex={0}
        className={`cursor-help font-mono text-[11px] underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-claw ${
          state === 'locked' ? 'decoration-claw text-ink' : 'decoration-line hover:decoration-ink'
        }`}
        onClick={(e) => {
          // Klick/Tap: locken bzw. wieder loesen — waehlt NICHT die Zeile aus
          e.stopPropagation();
          e.preventDefault();
          if (state === 'locked') setState('closed');
          else openAt('locked');
        }}
      >
        {name}
      </span>
      {open && info && pos && (
        <PortalPopover
          pos={pos}
          locked={state === 'locked'}
          popRef={popRef}
          onClose={() => setState('closed')}
        >
          <ObjectInfoBody info={info} network={network} field={field} nested={state === 'locked'} />
        </PortalPopover>
      )}
    </span>
  );
}

/** Nackte, komma-getrennte inspizierbare Objektnamen — fuer Tabellenzellen. */
export function ObjectValues({
  values,
  field,
  network,
}: {
  values: string[];
  field: ObjectField;
  network: NetworkConfig;
}) {
  return (
    <>
      {values.map((value, i) => (
        <span key={value} className="inline-flex items-baseline">
          {i > 0 && <span className="mr-1 font-mono text-[11px] text-dim">,</span>}
          <ObjectValue network={network} field={field} name={value} />
        </span>
      ))}
    </>
  );
}

/** Feld-Chip (SOURCE, SERVICE, …) mit inspizierbaren Objektnamen. */
export function ObjectChip({
  label,
  values,
  field,
  network,
  failed,
}: {
  label: string;
  values: string[];
  field: ObjectField;
  network: NetworkConfig;
  failed: boolean;
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-row border px-1.5 py-0.5 transition-colors ${
        failed ? 'border-deny bg-deny/20 text-deny' : 'border-line/60 text-ink/90'
      }`}
    >
      <span className="text-[8px] uppercase tracking-wide text-dim">{label}</span>
      <ObjectValues values={values} field={field} network={network} />
      {failed && (
        <span aria-hidden className="text-[10px]">
          ✕
        </span>
      )}
    </span>
  );
}

/** Chip mit statischem Erklaertext (Schedule, SNAT) — gleiches Lock-Verhalten. */
export function InfoChip({
  label,
  value,
  failed,
  infoKey,
}: {
  label: string;
  value: string;
  failed: boolean;
  infoKey: string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<OpenState>('closed');
  const [pos, setPos] = useState<Pos | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useLockedClickOutside(state === 'locked', anchorRef, popRef, () => setState('closed'));

  const openAt = (next: OpenState) => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4 });
    setState(next);
  };

  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-row border px-1.5 py-0.5 transition-colors ${
        failed ? 'border-deny bg-deny/20 text-deny' : 'border-line/60 text-ink/90'
      }`}
      onMouseEnter={() => state === 'closed' && openAt('hover')}
      onMouseLeave={() => state === 'hover' && setState('closed')}
      onFocus={() => state === 'closed' && openAt('hover')}
      onBlur={() => state === 'hover' && setState('closed')}
      onKeyDown={(e) => e.key === 'Escape' && setState('closed')}
    >
      {label && <span className="text-[8px] uppercase tracking-wide text-dim">{label}</span>}
      <span
        ref={anchorRef}
        tabIndex={0}
        className="cursor-help font-mono text-[11px] underline decoration-dotted decoration-line underline-offset-2"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (state === 'locked') setState('closed');
          else openAt('locked');
        }}
      >
        {value}
      </span>
      {failed && (
        <span aria-hidden className="text-[10px]">
          ✕
        </span>
      )}
      {state !== 'closed' && pos && (
        <PortalPopover
          pos={pos}
          locked={state === 'locked'}
          popRef={popRef}
          onClose={() => setState('closed')}
        >
          <span className="block max-w-[240px] pr-3 text-[10px] leading-snug text-dim">
            {t(infoKey)}
          </span>
        </PortalPopover>
      )}
    </span>
  );
}
