/**
 * Sandbox: eigenes Regelwerk über einem Startnetz bauen, Testpakete abfeuern,
 * den animierten Match-Trace ansehen. Komplette Netz-Definition (Interfaces,
 * Objekte, Routen) via JSON-Export/Import austauschbar.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { evaluate, makeConfig, makePolicy } from '../../engine';
import type { NetworkConfig, Packet, Verdict } from '../../engine';
import { useGame } from '../../game/store';
import { Debrief } from '../components/Debrief';
import { NetworkDiagram } from '../components/NetworkDiagram';
import { PacketCard } from '../components/PacketCard';
import { ObjectBrowser } from '../components/ObjectBrowser';
import { RulesetWorkbench } from '../components/RulesetWorkbench';
import { useDescent } from '../hooks/useDescent';
import { useReducedMotionPref } from '../hooks/useReducedMotionPref';

const DEFAULT_NETWORK: NetworkConfig = makeConfig({
  interfaces: [
    { id: 'if-p1', name: 'port1' },
    { id: 'if-p2', name: 'port2' },
    { id: 'if-w1', name: 'wan1' },
  ],
  zones: [{ id: 'z-in', name: 'inside', members: ['if-p1'] }],
  addresses: [
    { id: 'LAN_NET', name: 'LAN_NET', type: 'subnet', subnet: '10.0.1.0/24' },
    { id: 'DMZ_NET', name: 'DMZ_NET', type: 'subnet', subnet: '172.16.0.0/24' },
    { id: 'SRV_WEB01', name: 'SRV_WEB01', type: 'host', host: '172.16.0.10' },
  ],
  services: [
    { id: 'HTTPS', name: 'HTTPS', protocol: 'tcp', dstPorts: [{ from: 443, to: 443 }] },
    { id: 'DNS', name: 'DNS', protocol: 'udp', dstPorts: [{ from: 53, to: 53 }] },
    { id: 'SSH', name: 'SSH', protocol: 'tcp', dstPorts: [{ from: 22, to: 22 }] },
    { id: 'PING', name: 'PING', protocol: 'icmp', icmpType: 8 },
  ],
  vips: [
    {
      id: 'VIP_WEB',
      name: 'VIP_WEB',
      extIp: '203.0.113.10',
      extPort: 443,
      mappedIp: '172.16.0.10',
      protocol: 'tcp',
    },
  ],
  routes: [
    { dst: '10.0.1.0/24', iface: 'port1' },
    { dst: '172.16.0.0/24', iface: 'port2' },
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
  ],
});

export function SandboxScreen() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotionPref();
  const bumpStats = useGame((s) => s.bumpStats);
  const [network, setNetwork] = useState<NetworkConfig>(DEFAULT_NETWORK);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [firedPacket, setFiredPacket] = useState<Packet | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [importError, setImportError] = useState(false);
  // Hits-Spalte wie FortiOS: kumuliert ueber alle gefeuerten Pakete;
  // Regelwerk-Aenderung setzt die Zaehler zurueck (wie nach Config-Change)
  const [hitCounts, setHitCounts] = useState<ReadonlyMap<number, number>>(new Map());
  const fileInput = useRef<HTMLInputElement>(null);

  // Testpaket-Formular
  const [srcintf, setSrcintf] = useState('port1');
  const [srcIp, setSrcIp] = useState('10.0.1.5');
  const [dstIp, setDstIp] = useState('203.0.113.50');
  const [protocol, setProtocol] = useState<'tcp' | 'udp' | 'icmp'>('tcp');
  const [dstPort, setDstPort] = useState('443');

  const onDescentDone = useCallback(() => setShowTrace(true), []);
  const descent = useDescent(verdict, reducedMotion, onDescentDone);

  const packet: Packet = useMemo(() => {
    const base: Packet = { srcintf, srcIp, dstIp, protocol };
    if (protocol === 'icmp') base.icmpType = 8;
    else base.dstPort = Number(dstPort) || 0;
    return base;
  }, [srcintf, srcIp, dstIp, protocol, dstPort]);

  function fire() {
    try {
      const result = evaluate(packet, network);
      bumpStats({ sandboxFired: 1 });
      setHitCounts((prev) => {
        const next = new Map(prev);
        next.set(result.matchedPolicyId, (next.get(result.matchedPolicyId) ?? 0) + 1);
        return next;
      });
      setFiredPacket(packet);
      setVerdict(result);
      setShowTrace(false);
      descent.reset();
      // Descent im nächsten Tick starten (Verdict-State muss gesetzt sein)
      window.setTimeout(() => descent.start(), 30);
    } catch {
      setImportError(true); // ungültige IPs etc.
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(network, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aethergate-sandbox.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as Partial<NetworkConfig>;
        if (!Array.isArray(parsed.interfaces) || !Array.isArray(parsed.routes)) {
          throw new Error('kein Netz');
        }
        setNetwork(makeConfig(parsed));
        setVerdict(null);
        setImportError(false);
      } catch {
        setImportError(true);
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 pb-8 pt-3 lg:max-w-6xl lg:px-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-lg font-bold">{t('nav.sandbox')}</h1>
        <div className="flex gap-2 font-mono text-xs">
          <button
            onClick={exportJson}
            className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
          >
            {t('sandbox.export')}
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="rounded-row border border-line px-2 py-1 text-dim hover:text-ink"
          >
            {t('sandbox.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importJson(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {importError && (
        <p className="rounded-panel border border-deny/60 bg-deny/5 px-3 py-2 text-sm text-deny">
          {t('sandbox.importError')}
        </p>
      )}

      <NetworkDiagram network={network} />

      {/* Testpaket-Former */}
      <section className="rounded-panel border border-claw/40 bg-panel px-3 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-dim">
          {t('sandbox.packetForm')}
        </div>
        <div className="flex flex-wrap items-end gap-2 font-mono text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-dim">srcintf</span>
            <select
              value={srcintf}
              onChange={(e) => setSrcintf(e.target.value)}
              className="rounded-row border border-line bg-bg px-2 py-1.5 text-ink"
            >
              {network.interfaces.map((i) => (
                <option key={i.id}>{i.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">src</span>
            <input
              value={srcIp}
              onChange={(e) => setSrcIp(e.target.value)}
              className="w-28 rounded-row border border-line bg-bg px-2 py-1.5 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">dst</span>
            <input
              value={dstIp}
              onChange={(e) => setDstIp(e.target.value)}
              className="w-28 rounded-row border border-line bg-bg px-2 py-1.5 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-dim">proto</span>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as 'tcp' | 'udp' | 'icmp')}
              className="rounded-row border border-line bg-bg px-2 py-1.5 text-ink"
            >
              <option>tcp</option>
              <option>udp</option>
              <option>icmp</option>
            </select>
          </label>
          {protocol !== 'icmp' && (
            <label className="flex flex-col gap-1">
              <span className="text-dim">dstPort</span>
              <input
                value={dstPort}
                onChange={(e) => setDstPort(e.target.value)}
                inputMode="numeric"
                className="w-16 rounded-row border border-line bg-bg px-2 py-1.5 text-ink"
              />
            </label>
          )}
          <button
            onClick={fire}
            className="rounded-panel bg-claw px-4 py-2 font-display text-sm font-bold text-bg hover:brightness-110"
          >
            {t('sandbox.fire')} →
          </button>
        </div>
      </section>

      {firedPacket && <PacketCard packet={firedPacket} />}

      {/* Eine Tabelle wie auf der echten FortiGate: Descent-Highlights und
          Bearbeitung teilen sich dieselbe Werkbank-Tabelle */}
      <RulesetWorkbench
        network={network}
        policies={network.policies}
        highlights={descent.highlights}
        chipRow={descent.chipRow}
        hitCounts={hitCounts}
        onChange={(policies) => {
          setNetwork((n) => ({ ...n, policies }));
          setVerdict(null);
          setHitCounts(new Map());
          descent.reset();
        }}
      />

      {verdict && showTrace && (
        <Debrief
          verdict={verdict}
          answer={{ action: verdict.action, policyId: verdict.matchedPolicyId }}
          correct={true}
          packet={firedPacket ?? undefined}
          onNext={() => {
            setVerdict(null);
            descent.reset();
          }}
          onRetry={() => undefined}
          onReplay={() => {
            setShowTrace(false);
            descent.reset();
            window.setTimeout(() => descent.start(), 30);
          }}
        />
      )}

      <ObjectBrowser network={network} />
    </div>
  );
}
