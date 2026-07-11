/**
 * Onboarding: interaktives 3-Minuten-Tutorial statt Textwand.
 * Ein geführtes Mini-Verdict — der Spieler MACHT jeden Schritt selbst
 * (ACCEPT tippen, Policy-Zeile tippen, Descent ansehen). Jederzeit skippbar.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate, makeConfig, makePolicy } from '../../engine';
import type { Packet } from '../../engine';
import { useGame } from '../../game/store';
import { Mascot } from '../components/Mascot';
import { PacketCard } from '../components/PacketCard';
import { PolicyTable } from '../components/PolicyTable';
import { useDescent } from '../hooks/useDescent';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

const TUTORIAL_NETWORK = makeConfig({
  interfaces: [
    { id: 'port1', name: 'port1' },
    { id: 'wan1', name: 'wan1' },
  ],
  addresses: [{ id: 'LAN_NET', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' }],
  services: [
    { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
    { id: 'RDP', name: 'RDP', protocol: 'tcp', dstPorts: [{ from: 3389, to: 3389 }] },
  ],
  routes: [
    { dst: '10.0.1.0/24', iface: 'port1' },
    { dst: '0.0.0.0/0', iface: 'wan1' },
  ],
  policies: [
    makePolicy({
      id: 1,
      name: 'lan-web-out',
      srcintf: ['port1'],
      dstintf: ['wan1'],
      srcaddr: ['LAN_NET'],
      service: ['HTTPS'],
      nat: true,
    }),
    makePolicy({
      id: 2,
      name: 'no-rdp-out',
      srcintf: ['port1'],
      dstintf: ['wan1'],
      service: ['RDP'],
      action: 'deny',
      log: true,
    }),
  ],
});

const TUTORIAL_PACKET: Packet = {
  srcintf: 'port1',
  srcIp: '10.0.1.5',
  dstIp: '203.0.113.50',
  protocol: 'tcp',
  dstPort: 443,
};

type Step = 'packet' | 'table' | 'action' | 'policy' | 'descent' | 'done';

export function OnboardingScreen() {
  const { t } = useTranslation();
  const setOnboarded = useGame((s) => s.setOnboarded);
  const reducedMotion = useReducedMotionPref();
  const [step, setStep] = useState<Step>('packet');
  const [pickedAction, setPickedAction] = useState(false);

  const verdict = useMemo(() => evaluate(TUTORIAL_PACKET, TUTORIAL_NETWORK), []);
  const onDescentDone = useCallback(() => setStep('done'), []);
  const descent = useDescent(verdict, reducedMotion, onDescentDone);

  const coachText: Record<Step, string> = {
    packet: t('onboarding.stepPacket'),
    table: t('onboarding.stepTable'),
    action: t('onboarding.stepAction'),
    policy: t('onboarding.stepPolicy'),
    descent: t('onboarding.stepDescent'),
    done: t('onboarding.stepDone'),
  };

  function finish() {
    setOnboarded();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-3xl">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold text-claw">{t('onboarding.title')}</h1>
        <button onClick={finish} className="font-mono text-xs text-dim underline hover:text-ink">
          {t('onboarding.skip')}
        </button>
      </div>

      {/* Coach: Snipp erklärt */}
      <div className="flex items-start gap-3 rounded-panel border border-claw/50 bg-panel px-4 py-3">
        <Mascot pose={step === 'done' ? 'happy' : 'idle'} size={44} />
        <p className="text-sm leading-relaxed text-ink" aria-live="polite">
          {coachText[step]}
        </p>
      </div>

      {/* Das Paket — im ersten Schritt hervorgehoben */}
      <div className={step === 'packet' ? 'ring-2 ring-claw rounded-panel' : ''}>
        <PacketCard packet={TUTORIAL_PACKET} />
      </div>
      {step === 'packet' && (
        <button
          onClick={() => setStep('table')}
          className="self-center rounded-panel bg-claw px-5 py-2.5 font-display font-bold text-bg"
        >
          {t('verdict.next')} →
        </button>
      )}

      {/* Die Tabelle */}
      {step !== 'packet' && (
        <>
          <div className={step === 'table' ? 'ring-2 ring-claw rounded-panel p-0.5' : ''}>
            <PolicyTable
              network={TUTORIAL_NETWORK}
              highlights={descent.highlights}
              chipRow={descent.chipRow}
              selectable={step === 'policy'}
              selectedId={null}
              onSelect={(id) => {
                if (id === 1) {
                  setStep('descent');
                  descent.start();
                }
              }}
            />
          </div>
          {step === 'table' && (
            <button
              onClick={() => setStep('action')}
              className="self-center rounded-panel bg-claw px-5 py-2.5 font-display font-bold text-bg"
            >
              {t('verdict.next')} →
            </button>
          )}
        </>
      )}

      {/* ACCEPT/DENY-Schritt: nur ACCEPT führt weiter (HTTPS ist erlaubt) */}
      {step === 'action' && (
        <div className="flex gap-3">
          <button
            onClick={() => {
              setPickedAction(true);
              setStep('policy');
            }}
            className="h-14 flex-1 rounded-panel border border-trace/50 font-display text-lg font-bold text-trace hover:bg-trace/10"
          >
            ✓ {t('verdict.accept')}
          </button>
          <button
            onClick={() => undefined}
            aria-disabled
            className="h-14 flex-1 cursor-not-allowed rounded-panel border border-line font-display text-lg font-bold text-dim/50"
          >
            ✕ {t('verdict.deny')}
          </button>
        </div>
      )}

      {step === 'descent' && (
        <button
          onClick={descent.skip}
          className="self-center rounded-panel border border-line px-4 py-2 text-sm text-dim"
        >
          {t('verdict.skipReplay')}
        </button>
      )}

      {step === 'done' && (
        <button
          onClick={finish}
          className="self-center rounded-panel bg-claw px-6 py-3 font-display text-lg font-bold text-bg hover:brightness-110"
        >
          {t('onboarding.finish')} →
        </button>
      )}
      {pickedAction && step === 'policy' && (
        <p className="text-center font-mono text-xs text-dim">{t('onboarding.hintRow1')}</p>
      )}
    </div>
  );
}
