/**
 * Gemeinsame Werkbank für Audit- und Incident-Modus: Regelwerk anzeigen,
 * Policies bearbeiten/verschieben/löschen/(de)aktivieren — jeder Eingriff
 * wird gezählt (Basis für den 3. Stern: minimaler Eingriff).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, Policy } from '../../engine';
import { PolicyEditor } from './PolicyEditor';
import { PolicyTable } from './PolicyTable';

export interface WorkbenchState {
  policies: Policy[];
  edits: number;
}

interface RulesetWorkbenchProps {
  network: NetworkConfig;
  policies: Policy[];
  onChange: (policies: Policy[], editCost: number) => void;
  /** Policy-Zeile antippen (z. B. für find-shadowed) statt bearbeiten */
  selectMode?: boolean;
  selectedId?: number | null;
  onSelect?: (policyId: number) => void;
  /** Werkzeuge ausblenden (reine Anzeige, z. B. nach Lösung) */
  readonly?: boolean;
}

export function RulesetWorkbench({
  network,
  policies,
  onChange,
  selectMode = false,
  selectedId = null,
  onSelect,
  readonly = false,
}: RulesetWorkbenchProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const config: NetworkConfig = { ...network, policies };
  const suggestedId = policies.reduce((max, p) => Math.max(max, p.id), 0) + 1;

  function move(id: number, direction: -1 | 1) {
    const index = policies.findIndex((p) => p.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= policies.length) return;
    const next = [...policies];
    const a = next[index] as Policy;
    next[index] = next[target] as Policy;
    next[target] = a;
    onChange(next, 1);
  }

  function toggleEnabled(id: number) {
    onChange(
      policies.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
      1,
    );
  }

  function remove(id: number) {
    onChange(
      policies.filter((p) => p.id !== id),
      1,
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <PolicyTable
        network={config}
        selectable={selectMode}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      {!readonly && !selectMode && (
        <div className="flex flex-col gap-1">
          {policies.map((policy) => (
            <div key={policy.id} className="flex flex-wrap items-center gap-1 font-mono text-xs">
              <span className="w-8 text-dim">#{policy.id}</span>
              <button
                onClick={() => move(policy.id, -1)}
                aria-label={`Policy ${policy.id} ${t('architect.moveUp')}`}
                className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
              >
                ↑
              </button>
              <button
                onClick={() => move(policy.id, 1)}
                aria-label={`Policy ${policy.id} ${t('architect.moveDown')}`}
                className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
              >
                ↓
              </button>
              <button
                onClick={() => setEditing(policy)}
                className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
              >
                {t('architect.edit')}
              </button>
              <button
                onClick={() => toggleEnabled(policy.id)}
                className="rounded-row border border-warn/40 px-2 py-1 text-warn/90 hover:text-warn"
              >
                {policy.enabled ? t('audit.disable') : t('audit.enable')}
              </button>
              <button
                onClick={() => remove(policy.id)}
                className="rounded-row border border-deny/40 px-2 py-1 text-deny/80 hover:text-deny"
              >
                {t('architect.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      {editing !== null ? (
        <PolicyEditor
          network={network}
          initial={editing === 'new' ? undefined : editing}
          suggestedId={suggestedId}
          onSave={(policy) => {
            const exists = policies.some((p) => p.id === policy.id);
            onChange(
              exists
                ? policies.map((p) => (p.id === policy.id ? policy : p))
                : [...policies, policy],
              1,
            );
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        !readonly &&
        !selectMode && (
          <button
            onClick={() => setEditing('new')}
            className="rounded-panel border border-dashed border-claw/60 px-4 py-2.5 font-display text-sm font-bold text-claw hover:bg-claw/10"
          >
            + {t('architect.addPolicy')}
          </button>
        )
      )}
    </div>
  );
}
