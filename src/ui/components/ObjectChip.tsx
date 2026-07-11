/**
 * Objekt-Chips mit Inspektion (FortiGate-Anleihe): Hover/Fokus/Tap auf einen
 * Objektnamen öffnet ein Popover mit dem aufgelösten Inhalt — Gruppen als
 * eingerückter Mitglieder-Baum, Objekte mit Wert (CIDR, Portrange, …).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig } from '../../engine';
import { resolveObjectInfo, type ObjectField, type ObjectInfo } from '../../game/objectInfo';

function InfoPopover({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="absolute left-0 top-full z-40 mt-1 block w-max max-w-[280px] cursor-default rounded-panel border border-line bg-bg px-3 py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
    >
      {children}
    </span>
  );
}

function ObjectInfoBody({ info }: { info: ObjectInfo }) {
  const { t } = useTranslation();
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
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
                {line.name}
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

/** Ein hoverbarer Objektname innerhalb eines Feld-Chips. */
function ObjectValue({
  network,
  field,
  name,
}: {
  network: NetworkConfig;
  field: ObjectField;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const info = useMemo(
    () => (open ? resolveObjectInfo(network, field, name) : null),
    [open, network, field, name],
  );
  const inspectable = !(field === 'srcintf' || field === 'dstintf') || name !== 'any';

  if (!inspectable) return <span className="font-mono text-[11px]">{name}</span>;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <span
        tabIndex={0}
        className="cursor-help font-mono text-[11px] underline decoration-dotted decoration-line underline-offset-2 hover:decoration-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-claw"
        onClick={(e) => {
          // Tap am Touch-Gerät: Popover togglen, ohne die Zeile auszuwählen
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {name}
      </span>
      {open && info && (
        <InfoPopover>
          <ObjectInfoBody info={info} />
        </InfoPopover>
      )}
    </span>
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
      {values.map((value, i) => (
        <span key={value} className="inline-flex items-baseline">
          {i > 0 && <span className="mr-1 font-mono text-[11px] text-dim">,</span>}
          <ObjectValue network={network} field={field} name={value} />
        </span>
      ))}
      {failed && (
        <span aria-hidden className="text-[10px]">
          ✕
        </span>
      )}
    </span>
  );
}

/** Chip mit statischem Erklaertext (Schedule, SNAT). */
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
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`relative inline-flex items-baseline gap-1 rounded-row border px-1.5 py-0.5 transition-colors ${
        failed ? 'border-deny bg-deny/20 text-deny' : 'border-line/60 text-ink/90'
      }`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <span className="text-[8px] uppercase tracking-wide text-dim">{label}</span>
      <span
        tabIndex={0}
        className="cursor-help font-mono text-[11px] underline decoration-dotted decoration-line underline-offset-2"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {value}
      </span>
      {failed && (
        <span aria-hidden className="text-[10px]">
          ✕
        </span>
      )}
      {open && (
        <InfoPopover>
          <span className="block max-w-[240px] text-[10px] leading-snug text-dim">
            {t(infoKey)}
          </span>
        </InfoPopover>
      )}
    </span>
  );
}
