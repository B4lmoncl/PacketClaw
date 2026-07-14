/**
 * Formular zum Anlegen/Bearbeiten einer Policy — touch-first (Chips statt
 * Drag-and-Drop), speist Architect-, Audit- und Incident-Modus.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, Policy } from '../../engine';
import { MatchLogic } from './MatchLogic';

interface PolicyEditorProps {
  network: NetworkConfig;
  initial?: Policy;
  suggestedId: number;
  onSave: (policy: Policy) => void;
  onCancel: () => void;
}

function MultiPick({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }
  return (
    <fieldset className="rounded-row border border-line/60 p-2">
      <legend className="px-1 font-mono text-[10px] uppercase tracking-wide text-dim">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              className={`rounded-row border px-2 py-1 font-mono text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-claw ${
                active ? 'border-claw bg-claw/15 text-claw' : 'border-line text-dim hover:text-ink'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PolicyEditor({
  network,
  initial,
  suggestedId,
  onSave,
  onCancel,
}: PolicyEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [srcintf, setSrcintf] = useState<string[]>(initial?.srcintf ?? []);
  const [dstintf, setDstintf] = useState<string[]>(initial?.dstintf ?? []);
  const [srcaddr, setSrcaddr] = useState<string[]>(initial?.srcaddr ?? []);
  const [dstaddr, setDstaddr] = useState<string[]>(initial?.dstaddr ?? []);
  const [service, setService] = useState<string[]>(initial?.service ?? []);
  const [action, setAction] = useState<'accept' | 'deny'>(initial?.action ?? 'accept');
  const [nat, setNat] = useState(initial?.nat ?? false);
  const [schedule, setSchedule] = useState<'always' | 'work-hours'>(initial?.schedule ?? 'always');
  const [log, setLog] = useState(initial?.log ?? false);

  const intfOptions = [
    ...network.interfaces.map((i) => i.name),
    ...network.zones.map((z) => z.name),
    'any',
  ];
  const addrOptions = [
    ...network.addresses.map((a) => a.name),
    ...network.addressGroups.map((g) => g.name),
    'all',
  ];
  const dstAddrOptions = [...addrOptions.slice(0, -1), ...network.vips.map((v) => v.name), 'all'];
  const svcOptions = [
    ...network.services.map((s) => s.name),
    ...network.serviceGroups.map((g) => g.name),
    'ALL',
  ];

  const valid =
    srcintf.length > 0 &&
    dstintf.length > 0 &&
    srcaddr.length > 0 &&
    dstaddr.length > 0 &&
    service.length > 0;

  function save() {
    if (!valid) return;
    onSave({
      id: initial?.id ?? suggestedId,
      name: name.trim() || `policy-${initial?.id ?? suggestedId}`,
      enabled: initial?.enabled ?? true,
      srcintf,
      dstintf,
      srcaddr,
      dstaddr,
      service,
      action,
      nat,
      schedule,
      log,
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-panel border border-claw/50 bg-panel p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-dim">#{initial?.id ?? suggestedId}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('architect.policyName')}
          className="min-w-0 flex-1 rounded-row border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink placeholder:text-dim/60 focus:border-claw focus:outline-none"
        />
      </div>

      <MultiPick
        label={t('policyTable.srcintf')}
        options={intfOptions}
        value={srcintf}
        onChange={setSrcintf}
      />
      <MultiPick
        label={t('policyTable.dstintf')}
        options={intfOptions}
        value={dstintf}
        onChange={setDstintf}
      />
      <MultiPick
        label={t('policyTable.srcaddr')}
        options={addrOptions}
        value={srcaddr}
        onChange={setSrcaddr}
      />
      <MultiPick
        label={t('policyTable.dstaddr')}
        options={dstAddrOptions}
        value={dstaddr}
        onChange={setDstaddr}
      />
      <MultiPick
        label={t('policyTable.service')}
        options={svcOptions}
        value={service}
        onChange={setService}
      />

      {/* FortiOS-7.6-Logik: UND zwischen Feldern, ODER innerhalb — live */}
      <MatchLogic fields={{ srcintf, dstintf, srcaddr, dstaddr, service }} />

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex overflow-hidden rounded-row border border-line"
          role="radiogroup"
          aria-label={t('policyTable.action')}
        >
          <button
            type="button"
            role="radio"
            aria-checked={action === 'accept'}
            onClick={() => setAction('accept')}
            className={`px-3 py-1.5 font-mono text-xs font-bold ${action === 'accept' ? 'bg-trace text-bg' : 'text-trace'}`}
          >
            ✓ ACCEPT
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={action === 'deny'}
            onClick={() => setAction('deny')}
            className={`px-3 py-1.5 font-mono text-xs font-bold ${action === 'deny' ? 'bg-deny text-bg' : 'text-deny'}`}
          >
            ✕ DENY
          </button>
        </div>
        <label className="flex items-center gap-1.5 font-mono text-xs text-dim">
          <input
            type="checkbox"
            checked={nat}
            onChange={(e) => setNat(e.target.checked)}
            className="accent-claw"
          />
          NAT
        </label>
        <label className="flex items-center gap-1.5 font-mono text-xs text-dim">
          <input
            type="checkbox"
            checked={log}
            onChange={(e) => setLog(e.target.checked)}
            className="accent-claw"
          />
          Log
        </label>
        <select
          value={schedule}
          onChange={(e) => setSchedule(e.target.value as 'always' | 'work-hours')}
          className="rounded-row border border-line bg-bg px-2 py-1 font-mono text-xs text-ink"
          aria-label={t('policyTable.schedule')}
        >
          <option value="always">always</option>
          <option value="work-hours">work-hours</option>
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!valid}
          className="rounded-panel bg-claw px-4 py-2 font-display text-sm font-bold text-bg disabled:opacity-40"
        >
          {t('architect.savePolicy')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-panel border border-line px-4 py-2 text-sm text-dim hover:text-ink"
        >
          {t('architect.cancel')}
        </button>
      </div>
    </div>
  );
}
