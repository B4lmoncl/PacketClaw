/**
 * Management-Zugriff: drei Regler, ein Ziel, und die Möglichkeit, sich
 * auszusperren.
 *
 * Die Policy-Tabelle steht absichtlich mit im Bild und ist read-only. Sie ist
 * hier eine Attrappe — wer den Fehler dort sucht, sucht falsch, und das soll man
 * sehen können, statt es gesagt zu bekommen.
 *
 * Der Aussperr-Zustand bekommt eine eigene, laute Darstellung. Nicht als Strafe,
 * sondern weil er auf einer echten FortiGate etwas völlig anderes bedeutet als
 * „ein Prüfpunkt ist rot": ab da hilft nur die Konsole vor Ort.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig } from '../../engine';
import {
  FW_LAN_IP,
  FW_WAN_IP,
  generateMgmtCase,
  isLockedOut,
  MGMT_GATE,
  MGMT_NET,
  mgmtSolved,
  runMgmtSuite,
  setTrustedHosts,
  TOGGLEABLE,
  toggleAllowaccess,
} from '../../game/mgmt';
import { playAccept, playWrong } from '../../game/sound';
import { useGame } from '../../game/store';
import { ParticleBurst } from '../components/ParticleBurst';
import { PolicyTable } from '../components/PolicyTable';
import { XpGain } from '../components/XpGain';

type Phase = 'work' | 'done';

/** Die Auswahl für trusthost — bewusst vorgegeben, nicht frei tippbar: der
 *  Lerninhalt ist die ENTSCHEIDUNG, nicht das Eintippen einer CIDR. */
const TRUSTHOST_CHOICES: Array<{ key: string; hosts: string[] }> = [
  { key: 'anywhere', hosts: [] },
  { key: 'mgmt', hosts: [MGMT_NET] },
  { key: 'lan', hosts: ['10.0.1.0/24'] },
  { key: 'foreign', hosts: ['192.168.99.0/24'] },
];

export function MgmtScreen() {
  const { t } = useTranslation();
  const navigate = useGame((s) => s.navigate);
  const recordMgmt = useGame((s) => s.recordMgmt);
  const sound = useGame((s) => s.settings.sound);

  const [seed, setSeed] = useState(() => `${Date.now()}`);
  const initial = useMemo(() => generateMgmtCase(seed), [seed]);
  const [network, setNetwork] = useState<NetworkConfig>(initial.network);
  const [phase, setPhase] = useState<Phase>('work');
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const results = useMemo(() => runMgmtSuite(network), [network]);
  const solved = mgmtSolved(results);
  const lockedOut = isLockedOut(results);

  function check() {
    setChecked(true);
    setAttempts((n) => n + 1);
    if (solved) {
      if (sound) playAccept();
      // Weniger Versuche = mehr Punkte, aber nie unter dem Sockel
      recordMgmt(Math.max(120, 320 - (attempts + 1) * 40));
      setPhase('done');
    } else if (sound) {
      playWrong();
    }
  }

  function reset() {
    const next = `${Date.now()}`;
    setSeed(next);
    setNetwork(generateMgmtCase(next).network);
    setPhase('work');
    setChecked(false);
    setAttempts(0);
  }

  const admin = network.admins?.[0];
  const currentHosts = JSON.stringify(admin?.trustedHosts ?? []);

  if (phase === 'done') {
    return (
      <div className="mx-auto w-full max-w-2xl px-3 pt-6">
        <section className="panel-reward rarity-legendary relative flex flex-col items-center gap-4 rounded-panel px-6 py-8 text-center">
          <ParticleBurst variant="celebration" />
          <div className="font-display text-2xl font-bold text-trace">✓ {t('mgmt.solved')}</div>
          <p className="max-w-md font-mono text-xs leading-relaxed text-dim">
            {t(`mgmt.lesson.${initial.bug}`)}
          </p>
          <XpGain gained={Math.max(120, 320 - attempts * 40)} />
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="rounded-panel bg-aura px-5 py-2.5 font-display font-bold text-bg hover:brightness-110"
            >
              {t('mgmt.another')}
            </button>
            <button
              onClick={() => navigate({ name: 'home' })}
              className="rounded-panel border border-line px-5 py-2.5 font-display font-bold text-dim hover:text-ink"
            >
              {t('review.toMenu')}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-16 pt-4 lg:max-w-7xl lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold text-aura lg:text-2xl">
          🔐 {t('mgmt.title')}
        </h1>
        <p className="panel-inset rounded-panel px-4 py-3 text-sm leading-relaxed text-ink">
          {t(initial.ticketKey)}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-3">
          {/* Regler 1+2: allowaccess pro Interface mit IP */}
          <section className="panel-action flex flex-col gap-3 rounded-panel px-4 py-3">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-aura/90">
              {t('mgmt.allowaccess')}
            </h2>
            {network.interfaces
              .filter((i) => i.ip !== undefined)
              .map((iface) => (
                <div key={iface.name} className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[9rem]">
                    <div className="font-mono text-sm text-ink">{iface.name}</div>
                    <div className="font-mono text-[10px] text-dim">
                      {iface.ip}
                      {iface.ip === FW_WAN_IP && ` · ${t('mgmt.facingInternet')}`}
                      {iface.ip === FW_LAN_IP && ` · ${t('mgmt.facingOffice')}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {TOGGLEABLE.map((service) => {
                      const on = (iface.allowaccess ?? []).includes(service);
                      return (
                        <button
                          key={service}
                          onClick={() => {
                            setNetwork((n) => toggleAllowaccess(n, iface.name, service));
                            setChecked(false);
                          }}
                          aria-pressed={on}
                          className={`rounded-row border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                            on
                              ? 'border-trace bg-trace/15 text-trace'
                              : 'border-line text-dim hover:text-ink'
                          }`}
                        >
                          {on ? '✓ ' : ''}
                          {service}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </section>

          {/* Regler 3: trusthost */}
          {admin && (
            <section className="panel-action flex flex-col gap-2 rounded-panel px-4 py-3">
              <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-aura/90">
                {t('mgmt.trusthost', { admin: admin.name })}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {TRUSTHOST_CHOICES.map((choice) => {
                  const on = JSON.stringify(choice.hosts) === currentHosts;
                  return (
                    <button
                      key={choice.key}
                      onClick={() => {
                        setNetwork((n) => setTrustedHosts(n, admin.name, choice.hosts));
                        setChecked(false);
                      }}
                      aria-pressed={on}
                      className={`rounded-row border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                        on
                          ? 'border-aura bg-aura/15 text-aura'
                          : 'border-line text-dim hover:text-ink'
                      }`}
                    >
                      {t(`mgmt.host.${choice.key}`)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Die Attrappe: read-only, entscheidet hier nichts */}
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-dim">
                {t('mgmt.forwardTable')}
              </h2>
              <span className="font-mono text-[10px] text-dim/70">{t('mgmt.forwardHint')}</span>
            </div>
            <PolicyTable network={network} />
          </section>
        </div>

        {/* Prüfung */}
        <aside className="flex flex-col gap-3">
          <section
            className={`flex flex-col gap-2 rounded-panel px-4 py-3 ${
              checked && lockedOut ? 'panel-reward rarity-legendary' : 'panel-inset'
            }`}
          >
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-claw/90">
              {t('mgmt.checks')}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {results.map((r) => (
                <li key={r.check.labelKey} className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 shrink-0 font-mono text-xs ${
                      !checked ? 'text-dim/50' : r.ok ? 'text-trace' : 'text-deny'
                    }`}
                    aria-hidden
                  >
                    {!checked ? '○' : r.ok ? '✓' : '✕'}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] leading-snug text-ink">
                      {t(r.check.labelKey)}
                    </div>
                    {checked && !r.ok && (
                      <div className="font-mono text-[10px] text-deny/90">
                        {t(`mgmt.gate.${r.gate}`)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {checked && lockedOut && (
              <p className="mt-1 font-mono text-[11px] font-bold leading-relaxed text-warn">
                🔒 {t('mgmt.lockedOut')}
              </p>
            )}
            {checked && !solved && !lockedOut && (
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-dim">
                {t('mgmt.tooOpen')}
              </p>
            )}
          </section>

          <button
            onClick={check}
            className="rounded-panel bg-aura px-5 py-3 font-display text-base font-bold text-bg hover:brightness-110"
          >
            {t('mgmt.checkButton')}
          </button>

          {/* Erst nach zwei Fehlversuchen. Vorher waere es die Antwort: die
              Uebung ist herauszufinden, WO man suchen muss. */}
          {attempts >= 2 && !solved && (
            <p className="panel-inset rounded-panel px-3 py-2 font-mono text-[10px] leading-relaxed text-warn/90">
              💡 {t('mgmt.gateHint', { gate: t(`mgmt.gate.${MGMT_GATE[initial.bug]}`) })}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
