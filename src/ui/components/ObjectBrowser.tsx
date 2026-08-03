/**
 * Objekt-Browser (FortiGate „Policy & Objects"): zeigt den kompletten
 * Objektbestand eines Netzes in Tabellen — Adressen, Adressgruppen, Services,
 * Service-Gruppen, Virtual IPs, Interfaces/Zonen, Routen. Read-only, damit man
 * (wie im echten GUI) nachschlagen kann, was in den Objekten steckt, ohne jede
 * Policy-Zelle einzeln zu hovern.
 *
 * Jede Zeile trägt die **Ref.**-Spalte des Originals: die Zahl der Stellen, die
 * dieses Objekt direkt nennen. Ein Klick klappt auf, WO das ist. Das beantwortet
 * die zwei Fragen, die im Alltag ständig kommen — „welche Regeln fasse ich an,
 * wenn ich LAN_NET ändere?" und „kann ich das hier wegwerfen?" — und macht
 * nebenbei sichtbar, warum FortiOS ein benutztes Objekt nicht löschen lässt.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NetworkConfig, ObjectRef, RefKind } from '../../engine';
import { findReferences, unusedObjects } from '../../engine';
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

/** Eine Verweis-Zeile: „Policy 3 · Inside to DMZ → Destination". */
function RefLine({ reference }: { reference: ObjectRef }) {
  const { t } = useTranslation();
  const where =
    reference.policyId === undefined
      ? `${t(`refs.via.${reference.via}`)} ${reference.name}`
      : `${t(`refs.via.${reference.via}`)} ${reference.policyId} · ${reference.name}`;
  return (
    <div className="flex items-baseline gap-1.5 py-0.5 pl-3 font-mono text-[10px] text-dim">
      <span aria-hidden>↳</span>
      <span className="text-ink/80">{where}</span>
      <span className="text-dim/70">→ {t(`refs.field.${reference.field}`)}</span>
    </div>
  );
}

function Row({
  name,
  detail,
  badge,
  refs,
}: {
  name: string;
  detail?: string;
  badge?: string;
  /** Fehlend heisst: fuer diese Zeile gibt es keine Ref.-Zaehlung (Routen) */
  refs?: ObjectRef[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = refs?.length ?? 0;

  return (
    <div className="border-t border-line/30 py-1 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
        <span className="flex items-baseline gap-1.5">
          <span className="text-ink">{name}</span>
          {badge && (
            <span className="rounded-row bg-line/40 px-1 text-[8px] uppercase tracking-wide text-dim">
              {badge}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          {detail && <span className="text-right text-dim">{detail}</span>}
          {refs !== undefined &&
            (count === 0 ? (
              // Keine Verweise: im Original einfach eine graue Null. Genau die
              // ist der Aufraeum-Hinweis, deshalb bleibt sie sichtbar.
              <span
                className="rounded-row px-1 text-[10px] text-dim/50"
                title={t('refs.unusedHint')}
              >
                {t('refs.short')} 0
              </span>
            ) : (
              <button
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className={`rounded-row px-1 text-[10px] transition-colors ${
                  open ? 'bg-aura/20 text-aura' : 'bg-line/40 text-dim hover:text-ink'
                }`}
                title={t('refs.tooltip', { count })}
              >
                {t('refs.short')} {count}
              </button>
            ))}
        </span>
      </div>
      {open && refs && (
        <div className="mt-0.5 border-l border-line/40">
          {refs.map((r, i) => (
            <RefLine key={`${r.via}-${r.name}-${r.field}-${i}`} reference={r} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ObjectBrowser({ network }: { network: NetworkConfig }) {
  const { t } = useTranslation();
  const refsFor = (kind: RefKind, name: string) => findReferences(network, kind, name);
  const unused = unusedObjects(network);

  return (
    <details className="glass rounded-panel">
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
                refs={refsFor('interface', i.name)}
              />
            );
          })}
        </Section>

        <Section title={t('objectBrowser.zones')} count={network.zones.length}>
          {network.zones.map((z) => (
            <Row
              key={z.id}
              name={z.name}
              // Mitglieder stehen im Modell mal als ID, mal als Name. Angezeigt
              // wird der Name — „if-p1" sagt niemandem etwas, und im GUI einer
              // FortiGate steht dort das Interface, nicht seine interne Kennung.
              detail={z.members
                .map((m) => network.interfaces.find((i) => i.id === m || i.name === m)?.name ?? m)
                .join(', ')}
              refs={refsFor('zone', z.name)}
            />
          ))}
        </Section>

        <Section title={t('objectBrowser.addresses')} count={network.addresses.length}>
          {network.addresses.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              detail={formatAddress(a)}
              badge={a.type}
              refs={refsFor('address', a.name)}
            />
          ))}
        </Section>

        <Section title={t('objectBrowser.addressGroups')} count={network.addressGroups.length}>
          {network.addressGroups.map((g) => (
            <Row
              key={g.id}
              name={g.name}
              detail={g.members.join(', ')}
              refs={refsFor('addressGroup', g.name)}
            />
          ))}
        </Section>

        <Section title={t('objectBrowser.services')} count={network.services.length}>
          {network.services.map((s) => (
            <Row
              key={s.id}
              name={s.name}
              detail={formatService(s)}
              refs={refsFor('service', s.name)}
            />
          ))}
        </Section>

        <Section title={t('objectBrowser.serviceGroups')} count={network.serviceGroups.length}>
          {network.serviceGroups.map((g) => (
            <Row
              key={g.id}
              name={g.name}
              detail={g.members.join(', ')}
              refs={refsFor('serviceGroup', g.name)}
            />
          ))}
        </Section>

        <Section title={t('objectBrowser.vips')} count={network.vips.length}>
          {network.vips.map((v) => {
            const ext = v.extPort === undefined ? v.extIp : `${v.extIp}:${v.extPort}`;
            const mapped =
              v.mappedPort === undefined ? v.mappedIp : `${v.mappedIp}:${v.mappedPort}`;
            return (
              <Row
                key={v.id}
                name={v.name}
                detail={`${ext} → ${mapped}`}
                badge="DNAT"
                refs={refsFor('vip', v.name)}
              />
            );
          })}
        </Section>

        {/* Routen sind keine benannten Objekte — sie VERWEISEN nur (aufs
            Interface) und werden selbst nirgends referenziert. Deshalb ohne
            Ref.-Spalte: eine Null daneben waere eine falsche Aussage. */}
        <Section title={t('objectBrowser.routes')} count={network.routes.length}>
          {network.routes.map((r, i) => (
            <Row key={`${r.dst}-${i}`} name={r.dst} detail={`→ ${r.iface}`} />
          ))}
        </Section>

        {unused.length > 0 && (
          <p className="px-1 font-mono text-[10px] leading-relaxed text-dim/70">
            {t('refs.unusedCount', { count: unused.length })}
          </p>
        )}
      </div>
    </details>
  );
}
