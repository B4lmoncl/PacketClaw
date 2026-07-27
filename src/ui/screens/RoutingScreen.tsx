/**
 * Routing-Werkstatt: das Regelwerk ist korrekt und read-only, der Fehler
 * liegt in der Routing-Tabelle. Der Spieler diagnostiziert über Route Lookup
 * und den echten `diagnose debug flow`-Trace und repariert die Routen.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate } from '../../engine';
import type { NetworkConfig, RouteEntry } from '../../engine';
import {
  checkPasses,
  failingRoutes,
  generateRoutingCase,
  ROUTING_CONCEPT,
} from '../../game/routing';
import { useGame } from '../../game/store';
import { routingPayout } from '../../game/payouts';
import { DebugFlowView } from '../components/DebugFlowView';
import { ParticleBurst } from '../components/ParticleBurst';
import { PolicyTable } from '../components/PolicyTable';
import { RoutingTable } from '../components/RoutingTable';
import { XpGain } from '../components/XpGain';

type Phase = 'intro' | 'play' | 'done';

export function RoutingScreen() {
  const { t } = useTranslation();
  const routingSolved = useGame((s) => s.routingSolved);
  const recordRouting = useGame((s) => s.recordRouting);
  const navigate = useGame((s) => s.navigate);

  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const kase = useMemo(() => generateRoutingCase(seed), [seed]);

  const [routes, setRoutes] = useState<RouteEntry[]>(() => kase.network.routes);
  const [tries, setTries] = useState(0);
  const [score, setScore] = useState(0);

  const config = useMemo<NetworkConfig>(
    () => ({ ...kase.network, routes }),
    [kase.network, routes],
  );
  const failing = failingRoutes(kase.suite, config);
  const verdict = useMemo(() => evaluate(kase.probe, config), [kase.probe, config]);

  function reset() {
    const next = `${Date.now()}`;
    const fresh = generateRoutingCase(next);
    setSeed(next);
    setRoutes(fresh.network.routes);
    setTries(0);
    setScore(0);
    setPhase('intro');
  }

  function verify() {
    if (failing > 0) {
      setTries((n) => n + 1);
      return;
    }
    const s = routingPayout(tries);
    setScore(s);
    recordRouting(s);
    setPhase('done');
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
        <h1 className="font-display text-2xl font-bold text-trace">🧭 {t('routing.title')}</h1>
        <p className="text-sm leading-relaxed text-dim">{t('routing.intro')}</p>
        <p className="rounded-panel border-l-2 border-l-trace/60 bg-panel/60 px-3 py-2 font-mono text-xs leading-relaxed text-dim">
          {t('routing.rule')}
        </p>
        {routingSolved > 0 && (
          <p className="font-mono text-xs text-dim">
            {t('routing.solved')}: <span className="font-bold text-trace">{routingSolved}</span>
          </p>
        )}
        <button
          onClick={() => setPhase('play')}
          className="rounded-panel bg-trace px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('routing.start')} →
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="relative flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
          <ParticleBurst variant="celebration" />
          <div className="font-display text-2xl font-bold text-trace">✓ {t('routing.fixed')}</div>
          <div className="max-w-sm font-mono text-xs leading-relaxed text-dim">
            {t(`routing.debrief.${ROUTING_CONCEPT[kase.bug]}`)}
          </div>
          <XpGain gained={score} />
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-panel bg-trace px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('routing.next')}
            </button>
            <button
              onClick={() => navigate({ name: 'home' })}
              className="rounded-panel border border-line px-5 py-2.5 font-display font-bold text-dim hover:text-ink"
            >
              {t('score.toChapter')}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      {/* Symptom-Ticket */}
      <section className="glass rounded-panel border-l-2 border-l-warn/70 px-4 py-3">
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
          <span className="h-3 w-0.5 rounded-full bg-warn" aria-hidden />
          {t('routing.ticket')}
        </div>
        <p className="text-sm leading-relaxed text-ink">🎫 {t(kase.symptomKey)}</p>
        <p className="mt-1.5 font-mono text-[11px] text-dim">
          {t('routing.probe', {
            src: kase.probe.srcIp,
            dst: kase.probe.dstIp,
            port: kase.probe.dstPort,
          })}
        </p>
      </section>

      {/* Prüfliste — zeigt auch „accept, aber falsches Interface" */}
      <section className="glass rounded-panel px-4 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-dim">
          {t('routing.checks')}
        </div>
        <ul className="flex flex-col gap-1">
          {kase.suite.map((check, i) => {
            const ok = checkPasses(check, config);
            const actual = evaluate(check.packet, config);
            return (
              <li key={i} className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className={ok ? 'text-trace' : 'text-deny'}>{ok ? '✓' : '✗'}</span>
                <span className="text-dim">
                  {check.packet.dstIp}:{check.packet.dstPort}
                </span>
                <span className="text-dim/70">
                  {t('routing.want')} {check.expect}
                  {check.expectDstintf ? ` @ ${check.expectDstintf}` : ''}
                </span>
                <span className={ok ? 'text-dim/70' : 'text-deny'}>
                  {t('routing.got')} {actual.action}
                  {actual.action === 'accept' ? ` @ ${actual.dstintf}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <RoutingTable
          network={kase.network}
          routes={routes}
          onChange={setRoutes}
          expectDstintf="port2"
        />
        <div className="flex flex-col gap-3">
          {/* Regelwerk read-only: der Fehler liegt NICHT hier */}
          <section className="glass rounded-panel px-4 py-3">
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
              <span className="h-3 w-0.5 rounded-full bg-claw" aria-hidden />
              {t('routing.rulesetLocked')}
            </div>
            <PolicyTable network={config} />
          </section>
          <DebugFlowView packet={kase.probe} verdict={verdict} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={verify}
          disabled={failing > 0}
          className={`rounded-panel px-5 py-2.5 font-display font-bold transition-colors ${
            failing === 0
              ? 'bg-trace text-bg hover:brightness-110'
              : 'cursor-not-allowed border border-line bg-panel text-dim/60'
          }`}
        >
          🧭 {t('routing.verify')}
        </button>
        <span className="font-mono text-xs text-dim" aria-live="polite">
          {failing === 0 ? t('routing.allGreen') : t('routing.stillFailing', { count: failing })}
        </span>
      </div>
    </div>
  );
}
