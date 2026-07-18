/**
 * DNAT/VIP-Workshop: internen Server aus dem Internet veröffentlichen.
 * Schritt 1 — Virtual IP anlegen (extern → intern). Schritt 2 — Eingangs-
 * Policy bauen, die die VIP als Ziel referenziert. „Test from the internet"
 * prüft per Engine, ob DNAT den Server erreicht.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, Policy, Vip } from '../../engine';
import { generateDnatChallenge, verifyDnat } from '../../game/dnat';
import { useGame } from '../../game/store';
import { ParticleBurst } from '../components/ParticleBurst';
import { RulesetWorkbench } from '../components/RulesetWorkbench';
import { XpGain } from '../components/XpGain';

type Phase = 'intro' | 'play' | 'done';

export function DnatScreen() {
  const { t } = useTranslation();
  const dnatSolved = useGame((s) => s.dnatSolved);
  const recordDnat = useGame((s) => s.recordDnat);
  const navigate = useGame((s) => s.navigate);

  const [phase, setPhase] = useState<Phase>('intro');
  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const ch = useMemo(() => generateDnatChallenge(seed), [seed]);

  const [vip, setVip] = useState<Vip | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  // VIP-Formular
  const [extIp, setExtIp] = useState('');
  const [extPort, setExtPort] = useState('');
  const [mappedIp, setMappedIp] = useState('');
  const [mappedPort, setMappedPort] = useState('');

  const config: NetworkConfig = { ...ch.baseNetwork, vips: vip ? [vip] : [], policies };
  const hostOptions = ch.baseNetwork.addresses.filter((a) => a.type === 'host');

  function reset() {
    const next = `${Date.now()}`;
    setSeed(next);
    setVip(null);
    setPolicies([]);
    setTries(0);
    setFeedback(null);
    setScore(0);
    setExtIp('');
    setExtPort('');
    setMappedIp('');
    setMappedPort('');
    setPhase('intro');
  }

  function saveVip() {
    const ep = Number(extPort);
    const mp = Number(mappedPort);
    if (!extIp || !mappedIp || !ep || !mp) {
      setFeedback(t('dnat.vipIncomplete'));
      return;
    }
    setVip({
      id: 'VIP_WEB',
      name: 'VIP_WEB',
      extIp,
      extPort: ep,
      mappedIp,
      mappedPort: mp,
      protocol: 'tcp',
    });
    setFeedback(null);
  }

  function test() {
    const failing = verifyDnat(config, ch);
    if (failing > 0) {
      setTries((n) => n + 1);
      setFeedback(t('dnat.stillFailing', { count: failing }));
      return;
    }
    const s = Math.max(30, 90 - tries * 10);
    setScore(s);
    recordDnat(s);
    setPhase('done');
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-10 lg:max-w-lg">
        <h1 className="font-display text-2xl font-bold text-aura">🌐 {t('dnat.title')}</h1>
        <p className="text-sm leading-relaxed text-dim">{t('dnat.intro')}</p>
        {dnatSolved > 0 && (
          <p className="font-mono text-xs text-dim">
            {t('dnat.solved')}: <span className="font-bold text-trace">{dnatSolved}</span>
          </p>
        )}
        <button
          onClick={() => setPhase('play')}
          className="rounded-panel bg-aura px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('dnat.start')} →
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="relative flex flex-col items-center gap-4 rounded-panel border border-trace/50 bg-panel px-6 py-8 text-center">
          <ParticleBurst variant="celebration" />
          <div className="font-display text-2xl font-bold text-trace">✓ {t('dnat.published')}</div>
          <div className="font-mono text-sm text-ink">{t('dnat.diagnosis')}</div>
          <div className="font-mono text-xs text-dim">{t('dnat.concept')}</div>
          <XpGain gained={score} />
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-panel bg-aura px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('dnat.next')}
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

  const inputClass =
    'w-full rounded-row border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink placeholder:text-dim/50 focus:border-aura/60 focus:outline-none';

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      {/* Auftrag */}
      <section className="glass rounded-panel border-l-2 border-l-aura/70 px-4 py-3">
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
          <span className="h-3 w-0.5 rounded-full bg-aura" aria-hidden />
          {t('dnat.ticket')}
        </div>
        <p className="text-sm leading-relaxed text-ink">
          🎫{' '}
          {t('dnat.task', {
            server: ch.server.name,
            ip: ch.server.ip,
            port: ch.server.port,
            extIp: ch.extIp,
            extPort: ch.extPort,
          })}
        </p>
      </section>

      {/* Schritt 1: Virtual IP */}
      <section className="glass rounded-panel px-4 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-aura/90">
          ① {t('dnat.vipStep')}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('dnat.extIp')}
            <input
              value={extIp}
              onChange={(e) => setExtIp(e.target.value)}
              placeholder={ch.extIp}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('dnat.extPort')}
            <input
              value={extPort}
              onChange={(e) => setExtPort(e.target.value)}
              placeholder={`${ch.extPort}`}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('dnat.mapIp')}
            <select
              value={mappedIp}
              onChange={(e) => setMappedIp(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {hostOptions.map((a) => (
                <option key={a.id} value={a.type === 'host' ? a.host : ''}>
                  {a.name} ({a.type === 'host' ? a.host : ''})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-mono text-[9px] uppercase tracking-wide text-dim">
            {t('dnat.mapPort')}
            <input
              value={mappedPort}
              onChange={(e) => setMappedPort(e.target.value)}
              placeholder={`${ch.server.port}`}
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={saveVip}
            className="rounded-row bg-aura/90 px-3 py-1.5 font-display text-xs font-bold text-bg hover:brightness-110"
          >
            {vip ? t('dnat.vipUpdate') : t('dnat.vipSave')}
          </button>
          {vip && (
            <span className="font-mono text-[11px] text-trace">
              ✓ VIP_WEB: {vip.extIp}:{vip.extPort} → {vip.mappedIp}:{vip.mappedPort}
            </span>
          )}
        </div>
      </section>

      {/* Schritt 2: Eingangs-Policy (Ziel = VIP) */}
      <div className="font-mono text-[10px] uppercase tracking-widest text-aura/90">
        ② {t('dnat.policyStep')}
      </div>
      <RulesetWorkbench
        network={config}
        policies={policies}
        onChange={(next) => {
          setPolicies(next);
          setFeedback(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={test}
          className="rounded-panel bg-trace px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
        >
          🌐 {t('dnat.test')}
        </button>
        {feedback && (
          <span className="font-mono text-xs text-deny" aria-live="polite">
            {feedback}
          </span>
        )}
      </div>
    </div>
  );
}
