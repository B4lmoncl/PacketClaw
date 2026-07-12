import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { createResolver } from '../../engine';
import type { MatchField, NetworkConfig, Policy, Resolver } from '../../engine';
import { InfoChip, ObjectChip, ObjectValues } from './ObjectChip';

export type RowState =
  'idle' | 'active' | 'failed' | 'skipped' | 'matched-accept' | 'matched-deny' | 'implicit-hit';

export interface RowHighlight {
  state: RowState;
  failedField?: MatchField;
}

interface PolicyTableProps {
  network: NetworkConfig;
  /** Highlights je Policy-ID (0 = Implicit-Deny-Zeile) */
  highlights?: ReadonlyMap<number, RowHighlight>;
  /** Zeile, in der der Paket-Chip gerade sitzt (Policy-ID, 0 = Implicit Deny) */
  chipRow?: number | null;
  selectable?: boolean;
  selectedId?: number | null;
  onSelect?: (policyId: number) => void;
}

const ROW_STATE_CLASSES: Record<RowState, string> = {
  idle: 'border-line',
  active: 'border-claw/70 bg-claw/5',
  failed: 'border-line',
  skipped: 'border-line opacity-60',
  'matched-accept': 'border-trace bg-trace/10',
  'matched-deny': 'border-deny bg-deny/10',
  'implicit-hit': 'border-deny bg-deny/15 animate-pulse',
};

function PacketChip() {
  return (
    <motion.span
      layoutId="packet-chip"
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      className="inline-block w-3 h-3 rounded-sm bg-claw shadow-[0_0_10px_rgba(255,90,60,0.9)]"
      aria-hidden
    />
  );
}

function PolicyRow({
  policy,
  network,
  highlight,
  hasChip,
  selectable,
  selected,
  onSelect,
}: {
  policy: Policy;
  network: NetworkConfig;
  highlight: RowHighlight;
  hasChip: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect?: (id: number) => void;
}) {
  const { t } = useTranslation();
  const failed = (field: MatchField) =>
    highlight.state === 'failed' && highlight.failedField === field;

  const rowClasses = ROW_STATE_CLASSES[highlight.state];
  const selectClasses = selectable
    ? 'cursor-pointer hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw'
    : '';
  const selectedClasses = selected ? 'ring-2 ring-claw' : '';

  const content = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-5 shrink-0 text-center font-mono text-xs text-dim">{policy.id}</span>
        {hasChip && <PacketChip />}
        <span className="truncate font-mono text-xs text-ink">{policy.name}</span>
        {!policy.enabled && (
          <span className="rounded-row bg-line/50 px-1 text-[9px] uppercase text-dim">
            {t('policyTable.disabled')}
          </span>
        )}
        <span
          className={`ml-auto shrink-0 rounded-row px-1.5 py-0.5 font-mono text-[10px] font-bold ${
            policy.action === 'accept' ? 'bg-trace/15 text-trace' : 'bg-deny/15 text-deny'
          }`}
        >
          {policy.action === 'accept' ? '✓ ACCEPT' : '✕ DENY'}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1 pl-7">
        <ObjectChip
          label={t('policyTable.srcintf')}
          values={policy.srcintf}
          field="srcintf"
          network={network}
          failed={failed('srcintf')}
        />
        <ObjectChip
          label={t('policyTable.dstintf')}
          values={policy.dstintf}
          field="dstintf"
          network={network}
          failed={failed('dstintf')}
        />
        <ObjectChip
          label={t('policyTable.srcaddr')}
          values={policy.srcaddr}
          field="srcaddr"
          network={network}
          failed={failed('srcaddr')}
        />
        <ObjectChip
          label={t('policyTable.dstaddr')}
          values={policy.dstaddr}
          field="dstaddr"
          network={network}
          failed={failed('dstaddr')}
        />
        <ObjectChip
          label={t('policyTable.service')}
          values={policy.service}
          field="service"
          network={network}
          failed={failed('service')}
        />
        {policy.schedule !== 'always' && (
          <InfoChip
            label={t('policyTable.schedule')}
            value={policy.schedule}
            failed={failed('schedule')}
            infoKey="objectInfo.schedule"
          />
        )}
        {policy.nat && (
          <InfoChip
            label={t('policyTable.nat')}
            value="SNAT"
            failed={false}
            infoKey="objectInfo.nat"
          />
        )}
      </div>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={() => onSelect?.(policy.id)}
        aria-pressed={selected}
        className={`block w-full rounded-row border px-2 py-1.5 text-left transition-colors ${rowClasses} ${selectClasses} ${selectedClasses}`}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={`rounded-row border px-2 py-1.5 transition-colors ${rowClasses}`}>
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop: echtes FortiGate-Spaltenlayout (ID | Name | From | To | Source |
// Destination | Schedule | Service | Action | NAT). Mobile bleibt Karten.
// ---------------------------------------------------------------------------
const COLS =
  'grid grid-cols-[2.75rem_minmax(120px,1.4fr)_minmax(64px,0.8fr)_minmax(64px,0.8fr)_minmax(110px,1.3fr)_minmax(110px,1.3fr)_minmax(74px,0.8fr)_minmax(90px,1fr)_minmax(74px,0.7fr)_minmax(50px,0.55fr)] items-center gap-2';

/** Welche Kopf-Spalte welchen Filter-Feldtyp bekommt (FortiGate-Spaltenfilter). */
const HEAD_FIELD: Partial<Record<string, FilterField>> = {
  srcintf: 'srcintf',
  dstintf: 'dstintf',
  srcaddr: 'srcaddr',
  dstaddr: 'dstaddr',
  service: 'service',
  action: 'action',
};

/**
 * Spaltenkopf-Filter wie in FortiOS: Klick oeffnet ein Dropdown mit den Werten
 * dieser Spalte samt Trefferzahl INNERHALB der aktuellen Auswahl (also unter
 * den bereits aktiven Filtern der anderen Spalten). Werte einer Spalte sind
 * ODER-verknuepft, Klick toggelt. Das Dropdown wird per Portal gerendert,
 * damit der horizontale Scroll-Container es nicht abschneidet.
 */
function HeaderFilter({
  label,
  field,
  network,
  filters,
  baseFor,
  onToggle,
}: {
  label: string;
  field: FilterField;
  network: NetworkConfig;
  filters: FieldFilter[];
  baseFor: (field: FilterField) => Policy[];
  onToggle: (field: FilterField, value: string, negate?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const activeFor = (value: string, negate: boolean) =>
    filters.some((f) => f.field === field && f.value === value && !!f.negate === negate);
  const hasActive = filters.some((f) => f.field === field);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const tgt = e.target as Node;
      if (btnRef.current?.contains(tgt) || popRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4 });
    setOpen(true);
  };

  const base = open ? baseFor(field) : [];
  const options = valueOptions(field, network);

  return (
    <span className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`inline-flex items-center gap-0.5 font-mono uppercase tracking-wide focus-visible:outline focus-visible:outline-1 focus-visible:outline-claw ${
          hasActive ? 'text-claw' : 'text-dim hover:text-ink'
        }`}
        aria-label={`${label} — ${t('policyTable.filterField')}`}
      >
        {label}
        <span aria-hidden className="text-[9px]">
          {hasActive ? '▾●' : '▾'}
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 60 }}
            className="max-h-64 w-max min-w-[150px] max-w-[240px] overflow-auto rounded-panel border border-line bg-bg p-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
          >
            {options.map((v) => {
              const count = base.filter((p) => policyPassesFilter(p, { field, value: v })).length;
              const sel = activeFor(v, false);
              const selNot = activeFor(v, true);
              const shown =
                field === 'action' || field === 'status' ? t(`policyTable.val.${v}`) : v;
              return (
                <span key={v} className="flex w-full items-stretch gap-0.5">
                  <button
                    type="button"
                    onClick={() => onToggle(field, v)}
                    className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-row px-2 py-1 text-left font-mono text-[11px] normal-case ${
                      sel ? 'bg-claw/15 text-claw' : 'text-ink/90 hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">
                      {sel ? '✓ ' : ''}
                      {shown}
                    </span>
                    <span className="shrink-0 tabular-nums text-dim">{count}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggle(field, v, true)}
                    title={t('policyTable.filterNot')}
                    aria-label={`NOT ${shown}`}
                    className={`shrink-0 rounded-row px-1.5 font-mono text-[11px] ${
                      selNot
                        ? 'bg-deny/20 text-deny'
                        : 'text-dim/60 hover:bg-white/5 hover:text-deny'
                    }`}
                  >
                    ≠
                  </button>
                </span>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}

function ColumnHeader({
  network,
  filters,
  baseFor,
  onToggle,
}: {
  network: NetworkConfig;
  filters: FieldFilter[];
  baseFor: (field: FilterField) => Policy[];
  onToggle: (field: FilterField, value: string) => void;
}) {
  const { t } = useTranslation();
  const heads = [
    'id',
    'name',
    'srcintf',
    'dstintf',
    'srcaddr',
    'dstaddr',
    'schedule',
    'service',
    'action',
    'nat',
  ] as const;
  return (
    <div
      role="row"
      className={`${COLS} border-b border-line px-2 py-1.5 text-[9px] uppercase tracking-wide text-dim`}
    >
      {heads.map((h) => {
        const field = HEAD_FIELD[h];
        return (
          <span role="columnheader" key={h} className="font-mono">
            {field ? (
              <HeaderFilter
                label={t(`policyTable.${h}`)}
                field={field}
                network={network}
                filters={filters}
                baseFor={baseFor}
                onToggle={onToggle}
              />
            ) : (
              t(`policyTable.${h}`)
            )}
          </span>
        );
      })}
    </div>
  );
}

function Cell({ failed, children }: { failed?: boolean; children: React.ReactNode }) {
  return (
    <div
      role="cell"
      className={`min-w-0 break-words font-mono text-[11px] ${
        failed ? 'rounded-row bg-deny/20 px-1 text-deny' : 'text-ink/90'
      }`}
    >
      {children}
    </div>
  );
}

function PolicyColumnsRow({
  policy,
  network,
  highlight,
  hasChip,
  selectable,
  selected,
  onSelect,
}: {
  policy: Policy;
  network: NetworkConfig;
  highlight: RowHighlight;
  hasChip: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect?: (id: number) => void;
}) {
  const { t } = useTranslation();
  const failed = (field: MatchField) =>
    highlight.state === 'failed' && highlight.failedField === field;
  const rowClasses = `${COLS} rounded-row border px-2 py-1.5 transition-colors ${
    ROW_STATE_CLASSES[highlight.state]
  } ${selectable ? 'cursor-pointer hover:bg-white/[0.03]' : ''} ${
    selected ? 'ring-2 ring-claw' : ''
  } ${!policy.enabled ? 'opacity-55' : ''}`;

  const cells = (
    <>
      <div role="cell" className="flex items-center gap-1.5 font-mono text-xs text-dim">
        {hasChip && <PacketChip />}
        {policy.id}
      </div>
      <div role="cell" className="min-w-0 truncate font-mono text-xs text-ink">
        {policy.name}
        {!policy.enabled && (
          <span className="ml-1 rounded-row bg-line/50 px-1 text-[9px] uppercase text-dim">
            {t('policyTable.disabled')}
          </span>
        )}
      </div>
      <Cell failed={failed('srcintf')}>
        <ObjectValues values={policy.srcintf} field="srcintf" network={network} />
      </Cell>
      <Cell failed={failed('dstintf')}>
        <ObjectValues values={policy.dstintf} field="dstintf" network={network} />
      </Cell>
      <Cell failed={failed('srcaddr')}>
        <ObjectValues values={policy.srcaddr} field="srcaddr" network={network} />
      </Cell>
      <Cell failed={failed('dstaddr')}>
        <ObjectValues values={policy.dstaddr} field="dstaddr" network={network} />
      </Cell>
      <Cell failed={failed('schedule')}>
        {policy.schedule === 'always' ? (
          <span className="text-dim">{policy.schedule}</span>
        ) : (
          <InfoChip
            label=""
            value={policy.schedule}
            failed={failed('schedule')}
            infoKey="objectInfo.schedule"
          />
        )}
      </Cell>
      <Cell failed={failed('service')}>
        <ObjectValues values={policy.service} field="service" network={network} />
      </Cell>
      <div role="cell">
        <span
          className={`inline-block rounded-row px-1.5 py-0.5 font-mono text-[10px] font-bold ${
            policy.action === 'accept' ? 'bg-trace/15 text-trace' : 'bg-deny/15 text-deny'
          }`}
        >
          {policy.action === 'accept' ? '✓ ACCEPT' : '✕ DENY'}
        </span>
      </div>
      <div role="cell" className="font-mono text-[10px]">
        {policy.nat ? (
          <InfoChip label="" value="SNAT" failed={false} infoKey="objectInfo.nat" />
        ) : (
          <span className="text-dim/50">—</span>
        )}
      </div>
    </>
  );

  if (selectable) {
    return (
      <div
        role="row"
        tabIndex={0}
        aria-selected={selected}
        onClick={() => onSelect?.(policy.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.(policy.id);
          }
        }}
        className={`${rowClasses} text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw`}
      >
        {cells}
      </div>
    );
  }
  return (
    <div role="row" className={rowClasses}>
      {cells}
    </div>
  );
}

/**
 * Spaltenfilter wie im FortiGate-GUI: erst die Spalte waehlen, dann ein
 * KONKRETES Objekt aus der Config (Dropdown, kein Freitext). Mehrere Filter
 * sind additiv (UND) und matchen exakt auf den Objektnamen in der Policy —
 * genau wie der "Add Filter"-Builder in FortiOS.
 */
type FilterField = 'srcaddr' | 'dstaddr' | 'service' | 'srcintf' | 'dstintf' | 'action' | 'status';

const FILTER_FIELDS: FilterField[] = [
  'srcaddr',
  'dstaddr',
  'service',
  'srcintf',
  'dstintf',
  'action',
  'status',
];

interface FieldFilter {
  field: FilterField;
  value: string;
  /** true = NOT-Filter (not equals), wie im FortiOS-Filter-Dialog */
  negate?: boolean;
}

/** Auswaehlbare Werte je Spalte: die real in der Config vorhandenen Objekte. */
function valueOptions(field: FilterField, network: NetworkConfig): string[] {
  const uniq = (xs: string[]) => Array.from(new Set(xs));
  switch (field) {
    case 'srcaddr':
      return uniq([
        'all',
        ...network.addresses.map((a) => a.name),
        ...network.addressGroups.map((g) => g.name),
      ]);
    case 'dstaddr':
      return uniq([
        'all',
        ...network.addresses.map((a) => a.name),
        ...network.addressGroups.map((g) => g.name),
        ...network.vips.map((v) => v.name),
      ]);
    case 'service':
      return uniq([
        'ALL',
        ...network.services.map((s) => s.name),
        ...network.serviceGroups.map((g) => g.name),
      ]);
    case 'srcintf':
    case 'dstintf':
      return uniq([
        'any',
        ...network.interfaces.map((i) => i.name),
        ...network.zones.map((z) => z.name),
      ]);
    case 'action':
      return ['accept', 'deny'];
    case 'status':
      return ['enabled', 'disabled'];
  }
}

function policyPassesFilter(policy: Policy, { field, value }: FieldFilter): boolean {
  switch (field) {
    case 'action':
      return policy.action === value;
    case 'status':
      return value === 'enabled' ? policy.enabled : !policy.enabled;
    default:
      return policy[field].includes(value);
  }
}

function matchesFieldFilters(policy: Policy, filters: FieldFilter[]): boolean {
  // Positive Werte derselben Spalte sind ODER-verknuepft (wie FortiGate),
  // Spalten UND; NOT-Filter schliessen einzeln aus (UND).
  const byField = new Map<FilterField, string[]>();
  for (const f of filters) {
    if (f.negate) {
      if (policyPassesFilter(policy, f)) return false;
      continue;
    }
    const arr = byField.get(f.field);
    if (arr) arr.push(f.value);
    else byField.set(f.field, [f.value]);
  }
  for (const [field, values] of byField) {
    if (!values.some((value) => policyPassesFilter(policy, { field, value }))) return false;
  }
  return true;
}

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Freitext-Filter wie im FortiGate-GUI: alle Tokens muessen irgendwo passen.
 * IP-Tokens (z. B. "10.0.1.5") matchen zusaetzlich per CONTAINMENT: Regeln,
 * deren Adressobjekte/Gruppen die IP enthalten — nicht nur Namens-Substring.
 */
export function policyMatches(policy: Policy, tokens: string[], resolver?: Resolver): boolean {
  const haystack = [
    String(policy.id),
    policy.name,
    policy.action,
    policy.schedule,
    policy.nat ? 'snat nat' : '',
    policy.enabled ? '' : 'disabled',
    ...policy.srcintf,
    ...policy.dstintf,
    ...policy.srcaddr,
    ...policy.dstaddr,
    ...policy.service,
  ].map((v) => v.toLowerCase());
  return tokens.every((token) => {
    if (haystack.some((v) => v.includes(token))) return true;
    if (resolver && IPV4_RE.test(token)) {
      const entries = [...policy.srcaddr, ...policy.dstaddr];
      return entries.some(
        (entry) => entry === 'all' || resolver.addressEntryMatchesIp(entry, token),
      );
    }
    return false;
  });
}

export function PolicyTable({
  network,
  highlights,
  chipRow = null,
  selectable = false,
  selectedId = null,
  onSelect,
}: PolicyTableProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FieldFilter[]>([]);
  // FortiOS-Policy-Views: Interface Pair View gruppiert nach srcintf→dstintf
  const [view, setView] = useState<'sequence' | 'pairs'>('sequence');
  const [collapsedPairs, setCollapsedPairs] = useState<ReadonlySet<string>>(new Set());
  const [draftField, setDraftField] = useState<FilterField>('srcaddr');
  const [draftValue, setDraftValue] = useState('');
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const resolver = useMemo(() => createResolver(network), [network]);
  const filtering = tokens.length > 0 || filters.length > 0;
  const visiblePolicies = !filtering
    ? network.policies
    : network.policies.filter(
        (p) => policyMatches(p, tokens, resolver) && matchesFieldFilters(p, filters),
      );

  const draftOptions = valueOptions(draftField, network);
  const draftValueOrFirst = draftValue || draftOptions[0] || '';
  const addFilter = () => {
    if (!draftValueOrFirst) return;
    setFilters((f) =>
      f.some((x) => x.field === draftField && x.value === draftValueOrFirst)
        ? f
        : [...f, { field: draftField, value: draftValueOrFirst }],
    );
  };
  // Spaltenkopf-Filter: Wert togglen; Trefferzahl gegen die anderen aktiven Filter
  const toggleFilter = (field: FilterField, value: string, negate = false) =>
    setFilters((fs) =>
      fs.some((f) => f.field === field && f.value === value && !!f.negate === negate)
        ? fs.filter((f) => !(f.field === field && f.value === value && !!f.negate === negate))
        : [
            ...fs.filter((f) => !(f.field === field && f.value === value)),
            { field, value, negate },
          ],
    );
  const baseFor = (field: FilterField) => {
    const others = filters.filter((f) => f.field !== field);
    return network.policies.filter(
      (p) => policyMatches(p, tokens, resolver) && matchesFieldFilters(p, others),
    );
  };
  // Interface-Paar-Gruppen in Reihenfolge des ersten Auftretens (wie FortiOS)
  const pairGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; policies: Policy[] }> = [];
    const byKey = new Map<string, Policy[]>();
    for (const policy of visiblePolicies) {
      const label = `${policy.srcintf.join(', ')} → ${policy.dstintf.join(', ')}`;
      let arr = byKey.get(label);
      if (!arr) {
        arr = [];
        byKey.set(label, arr);
        groups.push({ key: label, label, policies: arr });
      }
      arr.push(policy);
    }
    return groups;
  }, [visiblePolicies]);
  const togglePair = (key: string) =>
    setCollapsedPairs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const implicitHighlight = highlights?.get(0) ?? { state: 'idle' as RowState };
  const implicitSelected = selectedId === 0;

  const implicitContent = (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-center font-mono text-xs text-dim">0</span>
      {chipRow === 0 && <PacketChip />}
      <span className="font-mono text-xs text-dim">{t('policyTable.implicitDeny')}</span>
      <span className="ml-auto shrink-0 rounded-row bg-deny/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-deny">
        ✕ DENY
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1" role="list" aria-label={t('app.policyTableAria')}>
      {network.policies.length > 6 && (
        <div className="mb-1 flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('policyTable.filter')}
            aria-label={t('policyTable.filter')}
            className="w-full rounded-row border border-line bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-dim/60 focus:border-claw/60 focus:outline-none"
          />
          <select
            value={draftField}
            onChange={(e) => {
              setDraftField(e.target.value as FilterField);
              setDraftValue('');
            }}
            aria-label={t('policyTable.filterField')}
            className="shrink-0 rounded-row border border-line bg-bg px-1.5 py-1.5 font-mono text-[11px] text-dim"
          >
            {FILTER_FIELDS.map((f) => (
              <option key={f} value={f}>
                {t(`policyTable.${f}`)}
              </option>
            ))}
          </select>
          <select
            value={draftValueOrFirst}
            onChange={(e) => setDraftValue(e.target.value)}
            aria-label={t('policyTable.filterValue')}
            className="w-32 shrink-0 rounded-row border border-line bg-bg px-1.5 py-1.5 font-mono text-[11px] text-ink"
          >
            {draftOptions.map((v) => (
              <option key={v} value={v}>
                {draftField === 'action' || draftField === 'status' ? t(`policyTable.val.${v}`) : v}
              </option>
            ))}
          </select>
          <button
            onClick={addFilter}
            className="shrink-0 rounded-row border border-line px-2 py-1 text-xs text-dim hover:text-ink"
            aria-label={t('policyTable.addFilter')}
          >
            {t('policyTable.addFilter')}
          </button>
          {filtering && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-dim">
              {visiblePolicies.length}/{network.policies.length}
            </span>
          )}
        </div>
      )}
      {filters.length > 0 && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {filters.map((f, i) => (
            <button
              key={`${f.field}-${f.value}-${i}`}
              onClick={() => setFilters((all) => all.filter((_, j) => j !== i))}
              className="inline-flex items-baseline gap-1 rounded-row border border-claw/50 bg-claw/10 px-1.5 py-0.5 font-mono text-[11px] text-ink hover:bg-claw/20"
              title={t('policyTable.filterClear')}
            >
              <span className="text-[8px] uppercase tracking-wide text-claw">
                {f.negate ? '≠ ' : ''}
                {t(`policyTable.${f.field}`)}
              </span>
              {f.field === 'action' || f.field === 'status'
                ? t(`policyTable.val.${f.value}`)
                : f.value}
              <span aria-hidden className="text-dim">
                ✕
              </span>
            </button>
          ))}
          <button
            onClick={() => {
              setFilters([]);
              setQuery('');
            }}
            className="rounded-row px-1.5 py-0.5 text-[11px] text-dim underline hover:text-ink"
          >
            {t('policyTable.filterClear')}
          </button>
        </div>
      )}
      {filtering && visiblePolicies.length === 0 && (
        <p className="rounded-row border border-line/60 px-2 py-1.5 text-xs text-dim">
          {t('policyTable.filterNoMatch')}
        </p>
      )}
      {/* Mobile: kompakte Karten (einhaendig) */}
      <div className="flex flex-col gap-1 lg:hidden">
        {visiblePolicies.map((policy) => (
          <div role="listitem" key={policy.id}>
            <PolicyRow
              policy={policy}
              network={network}
              highlight={highlights?.get(policy.id) ?? { state: 'idle' }}
              hasChip={chipRow === policy.id}
              selectable={selectable}
              selected={selectedId === policy.id}
              onSelect={onSelect}
            />
          </div>
        ))}
        <div role="listitem">
          {selectable ? (
            <button
              type="button"
              onClick={() => onSelect?.(0)}
              aria-pressed={implicitSelected}
              className={`block w-full rounded-row border border-dashed px-2 py-1.5 text-left transition-colors ${
                ROW_STATE_CLASSES[implicitHighlight.state]
              } cursor-pointer hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw ${
                implicitSelected ? 'ring-2 ring-claw' : ''
              }`}
            >
              {implicitContent}
            </button>
          ) : (
            <div
              className={`rounded-row border border-dashed px-2 py-1.5 transition-colors ${ROW_STATE_CLASSES[implicitHighlight.state]}`}
            >
              {implicitContent}
            </div>
          )}
        </div>
      </div>

      {/* Desktop: echtes FortiGate-Spaltenlayout */}
      <div className="hidden lg:block">
        {/* Policy-Views wie FortiOS: Interface Pair View | By Sequence */}
        <div className="mb-1 flex items-center justify-end gap-1 font-mono text-[10px]">
          <button
            onClick={() => setView('pairs')}
            aria-pressed={view === 'pairs'}
            className={`rounded-row border px-2 py-1 ${
              view === 'pairs'
                ? 'border-claw/60 bg-claw/10 text-claw'
                : 'border-line text-dim hover:text-ink'
            }`}
          >
            {t('policyTable.view.pairs')}
          </button>
          <button
            onClick={() => setView('sequence')}
            aria-pressed={view === 'sequence'}
            className={`rounded-row border px-2 py-1 ${
              view === 'sequence'
                ? 'border-claw/60 bg-claw/10 text-claw'
                : 'border-line text-dim hover:text-ink'
            }`}
          >
            {t('policyTable.view.sequence')}
          </button>
        </div>
        <div role="table" className="overflow-x-auto">
          <div className="min-w-[820px]">
            <ColumnHeader
              network={network}
              filters={filters}
              baseFor={baseFor}
              onToggle={toggleFilter}
            />
            <div className="flex flex-col gap-1 pt-1">
              {view === 'sequence'
                ? visiblePolicies.map((policy) => (
                    <PolicyColumnsRow
                      key={policy.id}
                      policy={policy}
                      network={network}
                      highlight={highlights?.get(policy.id) ?? { state: 'idle' }}
                      hasChip={chipRow === policy.id}
                      selectable={selectable}
                      selected={selectedId === policy.id}
                      onSelect={onSelect}
                    />
                  ))
                : pairGroups.map((group) => (
                    <div key={group.key} className="flex flex-col gap-1">
                      <button
                        onClick={() => togglePair(group.key)}
                        aria-expanded={!collapsedPairs.has(group.key)}
                        className="flex items-center gap-2 rounded-row border border-line/60 bg-panel/80 px-2 py-1 text-left font-mono text-[11px] text-dim hover:text-ink"
                      >
                        <span aria-hidden>{collapsedPairs.has(group.key) ? '▸' : '▾'}</span>
                        <span className="text-ink">{group.label}</span>
                        <span className="text-dim/60">({group.policies.length})</span>
                      </button>
                      {!collapsedPairs.has(group.key) &&
                        group.policies.map((policy) => (
                          <PolicyColumnsRow
                            key={policy.id}
                            policy={policy}
                            network={network}
                            highlight={highlights?.get(policy.id) ?? { state: 'idle' }}
                            hasChip={chipRow === policy.id}
                            selectable={selectable}
                            selected={selectedId === policy.id}
                            onSelect={onSelect}
                          />
                        ))}
                    </div>
                  ))}
              {/* Implicit Deny als Spaltenzeile */}
              <div
                role="row"
                tabIndex={selectable ? 0 : undefined}
                aria-selected={selectable ? implicitSelected : undefined}
                onClick={selectable ? () => onSelect?.(0) : undefined}
                onKeyDown={
                  selectable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect?.(0);
                        }
                      }
                    : undefined
                }
                className={`${COLS} rounded-row border border-dashed px-2 py-1.5 transition-colors ${
                  ROW_STATE_CLASSES[implicitHighlight.state]
                } ${
                  selectable
                    ? 'cursor-pointer hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw'
                    : ''
                } ${implicitSelected ? 'ring-2 ring-claw' : ''}`}
              >
                <div role="cell" className="flex items-center gap-1.5 font-mono text-xs text-dim">
                  {chipRow === 0 && <PacketChip />}0
                </div>
                <div role="cell" className="font-mono text-xs text-dim">
                  {t('policyTable.implicitDeny')}
                </div>
                <div role="cell" />
                <div role="cell" />
                <div role="cell" />
                <div role="cell" />
                <div role="cell" />
                <div role="cell" />
                <div role="cell">
                  <span className="inline-block rounded-row bg-deny/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-deny">
                    ✕ DENY
                  </span>
                </div>
                <div role="cell" className="text-dim/50">
                  —
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
