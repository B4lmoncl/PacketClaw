/**
 * Objekt-Browser (FortiGate „Policy & Objects"): zeigt den kompletten
 * Objektbestand eines Netzes in Tabellen — Adressen, Adressgruppen, Services,
 * Service-Gruppen, Virtual IPs, Interfaces/Zonen, Routen. Read-only, damit man
 * (wie im echten GUI) nachschlagen kann, was in den Objekten steckt, ohne jede
 * Policy-Zelle einzeln zu hovern. Rein aus NetworkConfig, keine Engine-Logik.
 */
import { useTranslation } from 'react-i18next';
import type { NetworkConfig } from '../../engine';
import { formatAddress, formatService } from '../../game/objectInfo';

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details className="rounded-row border border-line/60 bg-bg/40" open>
      <summary className="cursor-pointer select-none px-2 py-1.5 font-mono text-[11px] uppercase tracking-wide text-dim">
        {title} <span className="text-dim/60">({count})</span>
      </summary>
      <div className="flex flex-col gap-px px-2 pb-2">{children}</div>
    </details>
  );
}

function Row({ name, detail, badge }: { name: string; detail?: string; badge?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line/30 py-1 font-mono text-[11px] first:border-t-0">
      <span className="flex items-baseline gap-1.5">
        <span className="text-ink">{name}</span>
        {badge && (
          <span className="rounded-row bg-line/40 px-1 text-[8px] uppercase tracking-wide text-dim">
            {badge}
          </span>
        )}
      </span>
      {detail && <span className="text-right text-dim">{detail}</span>}
    </div>
  );
}

export function ObjectBrowser({ network }: { network: NetworkConfig }) {
  const { t } = useTranslation();

  return (
    <details className="rounded-panel border border-line bg-panel/60">
      <summary className="cursor-pointer select-none px-3 py-2 font-mono text-xs text-dim hover:text-ink">
        📁 {t('objectBrowser.title')}
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <Section title={t('objectBrowser.interfaces')} count={network.interfaces.length}>
          {network.interfaces.map((i) => {
            const zone = network.zones.find(
              (z) => z.members.includes(i.name) || z.members.includes(i.id),
            );
            return (
              <Row
                key={i.id}
                name={i.name}
                detail={zone ? t('objectInfo.inZone', { zone: zone.name }) : undefined}
              />
            );
          })}
        </Section>

        <Section title={t('objectBrowser.zones')} count={network.zones.length}>
          {network.zones.map((z) => (
            <Row key={z.id} name={z.name} detail={z.members.join(', ')} />
          ))}
        </Section>

        <Section title={t('objectBrowser.addresses')} count={network.addresses.length}>
          {network.addresses.map((a) => (
            <Row key={a.id} name={a.name} detail={formatAddress(a)} badge={a.type} />
          ))}
        </Section>

        <Section title={t('objectBrowser.addressGroups')} count={network.addressGroups.length}>
          {network.addressGroups.map((g) => (
            <Row key={g.id} name={g.name} detail={g.members.join(', ')} />
          ))}
        </Section>

        <Section title={t('objectBrowser.services')} count={network.services.length}>
          {network.services.map((s) => (
            <Row key={s.id} name={s.name} detail={formatService(s)} />
          ))}
        </Section>

        <Section title={t('objectBrowser.serviceGroups')} count={network.serviceGroups.length}>
          {network.serviceGroups.map((g) => (
            <Row key={g.id} name={g.name} detail={g.members.join(', ')} />
          ))}
        </Section>

        <Section title={t('objectBrowser.vips')} count={network.vips.length}>
          {network.vips.map((v) => {
            const ext = v.extPort === undefined ? v.extIp : `${v.extIp}:${v.extPort}`;
            const mapped =
              v.mappedPort === undefined ? v.mappedIp : `${v.mappedIp}:${v.mappedPort}`;
            return <Row key={v.id} name={v.name} detail={`${ext} → ${mapped}`} badge="DNAT" />;
          })}
        </Section>

        <Section title={t('objectBrowser.routes')} count={network.routes.length}>
          {network.routes.map((r, i) => (
            <Row key={`${r.dst}-${i}`} name={r.dst} detail={`→ ${r.iface}`} />
          ))}
        </Section>
      </div>
    </details>
  );
}
