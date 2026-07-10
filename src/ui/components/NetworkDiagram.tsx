import { useTranslation } from 'react-i18next';
import type { NetworkConfig } from '../../engine';

interface NodeInfo {
  name: string;
  subnets: string[];
  isWan: boolean;
  zone?: string;
}

/**
 * Mini-Netzdiagramm: Firewall in der Mitte, Interfaces links (intern) und
 * rechts (WAN/Internet), Subnetze aus der Routing-Tabelle abgeleitet.
 */
export function NetworkDiagram({ network }: { network: NetworkConfig }) {
  const { t } = useTranslation();

  const nodes: NodeInfo[] = network.interfaces.map((iface) => {
    const subnets = network.routes
      .filter((r) => r.iface === iface.name && r.dst !== '0.0.0.0/0')
      .map((r) => r.dst);
    const isWan = network.routes.some((r) => r.iface === iface.name && r.dst === '0.0.0.0/0');
    const zone = network.zones.find((z) =>
      z.members.some((m) => m === iface.id || m === iface.name),
    )?.name;
    return { name: iface.name, subnets, isWan, zone };
  });

  const internal = nodes.filter((n) => !n.isWan);
  const external = nodes.filter((n) => n.isWan);
  const rows = Math.max(internal.length, external.length, 1);
  const rowH = 42;
  const height = Math.max(90, rows * rowH + 24);
  const midY = height / 2;
  const width = 360;

  function nodeY(index: number, count: number): number {
    const totalH = count * rowH;
    return midY - totalH / 2 + index * rowH + rowH / 2;
  }

  return (
    <div className="bg-panel border border-line rounded-panel px-3 py-2 overflow-x-auto">
      <div className="text-[10px] uppercase tracking-widest text-dim mb-1">
        {t('network.diagram')}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-md"
        role="img"
        aria-label={t('network.diagram')}
      >
        {/* Firewall */}
        <rect
          x={width / 2 - 26}
          y={midY - 22}
          width="52"
          height="44"
          rx="6"
          fill="#0B1220"
          stroke="#FF5A3C"
          strokeWidth="1.5"
        />
        {/* Claw-Zangen-Mark + FW-Label (bewusst kein Emoji — Font-unabhängig) */}
        <path d={`M ${width / 2 - 14} ${midY - 8} q -6 -6 2 -10 q -2 8 6 8 Z`} fill="#FF5A3C" />
        <path d={`M ${width / 2 + 14} ${midY - 8} q 6 -6 -2 -10 q 2 8 -6 8 Z`} fill="#FF5A3C" />
        <text
          x={width / 2}
          y={midY + 6}
          textAnchor="middle"
          fill="#FF5A3C"
          fontSize="13"
          fontWeight="bold"
          fontFamily="monospace"
        >
          FW
        </text>
        {internal.map((node, i) => {
          const y = nodeY(i, internal.length);
          return (
            <g key={node.name}>
              <line
                x1="86"
                y1={y}
                x2={width / 2 - 26}
                y2={midY}
                stroke="#22304A"
                strokeWidth="1.5"
              />
              <rect
                x="6"
                y={y - 16}
                width="80"
                height="32"
                rx="4"
                fill="#111A2E"
                stroke="#22304A"
              />
              <text
                x="46"
                y={y - 3}
                textAnchor="middle"
                fill="#E6EDF7"
                fontSize="10"
                fontFamily="monospace"
              >
                {node.name}
                {node.zone ? ` (${node.zone})` : ''}
              </text>
              <text
                x="46"
                y={y + 10}
                textAnchor="middle"
                fill="#8A97AD"
                fontSize="8"
                fontFamily="monospace"
              >
                {node.subnets[0] ?? ''}
              </text>
            </g>
          );
        })}
        {external.map((node, i) => {
          const y = nodeY(i, external.length);
          return (
            <g key={node.name}>
              <line
                x1={width / 2 + 26}
                y1={midY}
                x2={width - 86}
                y2={y}
                stroke="#22304A"
                strokeWidth="1.5"
              />
              <rect
                x={width - 86}
                y={y - 16}
                width="80"
                height="32"
                rx="4"
                fill="#111A2E"
                stroke="#22304A"
              />
              <text
                x={width - 46}
                y={y - 3}
                textAnchor="middle"
                fill="#E6EDF7"
                fontSize="10"
                fontFamily="monospace"
              >
                {node.name}
              </text>
              <text
                x={width - 46}
                y={y + 10}
                textAnchor="middle"
                fill="#8A97AD"
                fontSize="8"
                fontFamily="monospace"
              >
                Internet
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
