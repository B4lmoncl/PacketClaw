/**
 * Statische Routing-Tabelle im FortiOS-Stil (Network → Static Routes):
 * Destination / Interface, hinzufügen, bearbeiten, löschen. Dazu ein
 * Route Lookup analog zum Policy Lookup — Ziel-IP eingeben, sehen welche
 * Route per Longest Prefix Match gewinnt und über welches Interface es geht.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, RouteEntry } from '../../engine';
import { lookupRoute } from '../../game/routing';

interface Props {
  network: NetworkConfig;
  routes: RouteEntry[];
  onChange: (routes: RouteEntry[]) => void;
  /** Interface, das laut Ticket getroffen werden soll (zum Hervorheben) */
  expectDstintf?: string;
}

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;

export function RoutingTable({ network, routes, onChange, expectDstintf }: Props) {
  const { t } = useTranslation();
  const [draftDst, setDraftDst] = useState('');
  const [draftIface, setDraftIface] = useState(network.interfaces[0]?.name ?? '');
  const [lookupIp, setLookupIp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lookup = lookupIp ? lookupRoute({ ...network, routes }, lookupIp) : null;

  function add() {
    if (!CIDR_RE.test(draftDst)) {
      setError(t('routing.badCidr'));
      return;
    }
    setError(null);
    onChange([...routes, { dst: draftDst, iface: draftIface }]);
    setDraftDst('');
  }

  const inputClass =
    'rounded-row border border-line bg-bg px-2 py-1 font-mono text-xs text-ink placeholder:text-dim/50 focus:border-trace/60 focus:outline-none';

  return (
    <section className="glass rounded-panel px-4 py-3">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
        <span className="h-3 w-0.5 rounded-full bg-trace" aria-hidden />
        {t('routing.tableTitle')}
      </div>

      {/* Kopfzeile */}
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 border-b border-line/60 pb-1 font-mono text-[10px] uppercase tracking-wide text-dim">
        <span>{t('routing.destination')}</span>
        <span>{t('routing.iface')}</span>
        <span />
      </div>

      <ul className="flex flex-col">
        {routes.map((route, i) => {
          const isDefault = route.dst === '0.0.0.0/0';
          return (
            <li
              key={`${route.dst}-${route.iface}-${i}`}
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-b border-line/30 py-1.5 font-mono text-xs last:border-0"
            >
              <span className="text-ink">
                {route.dst}
                {isDefault && (
                  <span className="ml-1.5 text-[10px] text-warn">{t('routing.defaultTag')}</span>
                )}
              </span>
              <select
                value={route.iface}
                onChange={(e) =>
                  onChange(routes.map((r, j) => (j === i ? { ...r, iface: e.target.value } : r)))
                }
                className={`${inputClass} ${
                  expectDstintf !== undefined && route.iface === expectDstintf
                    ? 'text-trace'
                    : 'text-ink'
                }`}
                aria-label={`${t('routing.iface')} ${route.dst}`}
              >
                {network.interfaces.map((iface) => (
                  <option key={iface.id} value={iface.name}>
                    {iface.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onChange(routes.filter((_, j) => j !== i))}
                className="rounded-row px-1.5 py-0.5 text-[11px] text-dim hover:bg-deny/15 hover:text-deny"
                aria-label={`${t('routing.delete')} ${route.dst}`}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {/* Neue Route */}
      <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
        <input
          value={draftDst}
          onChange={(e) => setDraftDst(e.target.value)}
          placeholder="172.16.0.0/24"
          className={inputClass}
          aria-label={t('routing.destination')}
        />
        <select
          value={draftIface}
          onChange={(e) => setDraftIface(e.target.value)}
          className={inputClass}
          aria-label={t('routing.iface')}
        >
          {network.interfaces.map((iface) => (
            <option key={iface.id} value={iface.name}>
              {iface.name}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          className="rounded-row bg-trace/90 px-3 py-1 font-display text-xs font-bold text-bg hover:brightness-110"
        >
          + {t('routing.add')}
        </button>
      </div>
      {error && <p className="mt-1 font-mono text-[11px] text-deny">{error}</p>}

      {/* Route Lookup */}
      <div className="mt-3 border-t border-line/60 pt-2">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
          🔍 {t('routing.lookup')}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={lookupIp}
            onChange={(e) => setLookupIp(e.target.value)}
            placeholder="172.16.0.10"
            className={inputClass}
            aria-label={t('routing.lookup')}
          />
          {lookup && (
            <span className="font-mono text-xs">
              {lookup.matched ? (
                <>
                  <span className="text-dim">{t('routing.wins')}: </span>
                  <span className="text-ink">{lookup.matched.dst}</span>
                  <span className="text-dim"> → </span>
                  <span
                    className={
                      expectDstintf !== undefined && lookup.dstintf !== expectDstintf
                        ? 'font-bold text-deny'
                        : 'font-bold text-trace'
                    }
                  >
                    {lookup.dstintf}
                  </span>
                </>
              ) : (
                <span className="text-deny">{t('routing.noRoute')}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
