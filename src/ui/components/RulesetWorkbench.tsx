/**
 * Gemeinsame Werkbank für Audit- und Incident-Modus: Regelwerk anzeigen,
 * Policies bearbeiten/verschieben/löschen/(de)aktivieren — jeder Eingriff
 * wird gezählt (Basis für den 3. Stern: minimaler Eingriff).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, Policy } from '../../engine';
import { PolicyContextMenu, type ContextMenuState } from './PolicyContextMenu';
import { PolicyEditor } from './PolicyEditor';
import { PolicyLookup } from './PolicyLookup';
import { PolicyTable, type RowHighlight } from './PolicyTable';

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
  /** Externe Zeilen-Highlights (z. B. Packet Descent in der Sandbox);
   *  ein aktiver Policy Lookup gewinnt, solange er gesetzt ist */
  highlights?: ReadonlyMap<number, RowHighlight>;
  chipRow?: number | null;
}

export function RulesetWorkbench({
  network,
  policies,
  onChange,
  selectMode = false,
  selectedId = null,
  onSelect,
  readonly = false,
  highlights,
  chipRow = null,
}: RulesetWorkbenchProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  // Einfüge-Index für "Insert Empty Policy Above/Below" aus dem Kontextmenü
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [lookupHighlights, setLookupHighlights] = useState<Map<number, RowHighlight> | undefined>();
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

  // Clone wie FortiOS: Kopie direkt unter dem Original, standardmäßig deaktiviert
  function clone(id: number) {
    const index = policies.findIndex((p) => p.id === id);
    const original = policies[index];
    if (!original) return;
    const copy: Policy = {
      ...original,
      id: suggestedId,
      name: `${original.name}_copy`,
      enabled: false,
    };
    const next = [...policies];
    next.splice(index + 1, 0, copy);
    onChange(next, 1);
  }

  const menuPolicy = menu ? policies.find((p) => p.id === menu.policyId) : undefined;
  const menuIndex = menu ? policies.findIndex((p) => p.id === menu.policyId) : -1;

  return (
    <div className="flex flex-col gap-2">
      <PolicyTable
        network={config}
        highlights={lookupHighlights ?? highlights}
        chipRow={chipRow}
        selectable={selectMode}
        selectedId={selectedId}
        onSelect={onSelect}
        onRowContextMenu={
          !readonly && !selectMode
            ? (policyId, e) => setMenu({ policyId, x: e.clientX, y: e.clientY })
            : undefined
        }
      />
      {/* FortiOS-Kontextmenü: Rechtsklick auf eine Policy-Zeile */}
      {menu && menuPolicy && (
        <PolicyContextMenu
          state={menu}
          onClose={() => setMenu(null)}
          items={[
            {
              key: 'edit',
              icon: '✎',
              label: t('architect.edit'),
              onClick: () => setEditing(menuPolicy),
            },
            {
              key: 'insertAbove',
              icon: '↥',
              label: t('policyMenu.insertAbove'),
              onClick: () => {
                setInsertAt(menuIndex);
                setEditing('new');
              },
            },
            {
              key: 'insertBelow',
              icon: '↧',
              label: t('policyMenu.insertBelow'),
              onClick: () => {
                setInsertAt(menuIndex + 1);
                setEditing('new');
              },
            },
            {
              key: 'clone',
              icon: '⧉',
              label: t('policyMenu.clone'),
              onClick: () => clone(menuPolicy.id),
            },
            {
              key: 'status',
              icon: menuPolicy.enabled ? '⏻' : '⏼',
              label: menuPolicy.enabled ? t('audit.disable') : t('audit.enable'),
              divider: true,
              onClick: () => toggleEnabled(menuPolicy.id),
            },
            {
              key: 'moveUp',
              icon: '↑',
              label: t('architect.moveUp'),
              disabled: menuIndex <= 0,
              onClick: () => move(menuPolicy.id, -1),
            },
            {
              key: 'moveDown',
              icon: '↓',
              label: t('architect.moveDown'),
              disabled: menuIndex >= policies.length - 1,
              onClick: () => move(menuPolicy.id, 1),
            },
            {
              key: 'delete',
              icon: '🗑',
              label: t('architect.delete'),
              danger: true,
              divider: true,
              onClick: () => remove(menuPolicy.id),
            },
          ]}
        />
      )}
      {/* Policy Lookup wie im FortiOS-GUI: pruefen, welche Regel greifen wuerde */}
      <PolicyLookup network={config} onHighlight={setLookupHighlights} />

      {!readonly && !selectMode && (
        <p className="hidden font-mono text-[10px] text-dim/70 lg:block">
          💡 {t('policyMenu.hint')}
        </p>
      )}

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
            let next: Policy[];
            if (exists) {
              next = policies.map((p) => (p.id === policy.id ? policy : p));
            } else if (insertAt !== null) {
              next = [...policies];
              next.splice(insertAt, 0, policy);
            } else {
              next = [...policies, policy];
            }
            onChange(next, 1);
            setEditing(null);
            setInsertAt(null);
          }}
          onCancel={() => {
            setEditing(null);
            setInsertAt(null);
          }}
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
