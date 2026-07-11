import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { MatchField, NetworkConfig, Policy } from '../../engine';
import { InfoChip, ObjectChip } from './ObjectChip';

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

export function PolicyTable({
  network,
  highlights,
  chipRow = null,
  selectable = false,
  selectedId = null,
  onSelect,
}: PolicyTableProps) {
  const { t } = useTranslation();
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
      {network.policies.map((policy) => (
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
  );
}
