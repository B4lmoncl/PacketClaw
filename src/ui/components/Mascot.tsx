/**
 * Claw — das PacketClaw-Maskottchen. Eigenes SVG, kein Fremd-Artwork.
 * Posen: idle, happy (Jubel), snip (DENY), facepalm (Fehlversuch).
 */
export type MascotPose = 'idle' | 'happy' | 'snip' | 'facepalm';

export function Mascot({ pose = 'idle', size = 64 }: { pose?: MascotPose; size?: number }) {
  const leftClawTransform = {
    idle: 'rotate(-15 22 34)',
    happy: 'rotate(-60 22 34)',
    snip: 'rotate(-35 22 34)',
    facepalm: 'rotate(-95 22 34) translate(6 -14)',
  }[pose];
  const rightClawTransform = {
    idle: 'rotate(15 78 34)',
    happy: 'rotate(60 78 34)',
    snip: 'rotate(35 78 34)',
    facepalm: 'rotate(15 78 34)',
  }[pose];
  const mouth = {
    idle: 'M 44 56 Q 50 60 56 56',
    happy: 'M 42 54 Q 50 64 58 54',
    snip: 'M 44 58 L 56 58',
    facepalm: 'M 44 60 Q 50 55 56 60',
  }[pose];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 80"
      role="img"
      aria-label="Claw, das PacketClaw-Maskottchen"
    >
      {/* Beine */}
      <g stroke="#C74A31" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M 30 62 L 18 72" />
        <path d="M 38 66 L 30 76" />
        <path d="M 70 62 L 82 72" />
        <path d="M 62 66 L 70 76" />
      </g>
      {/* Scheren */}
      <g transform={leftClawTransform}>
        <circle cx="16" cy="26" r="10" fill="#FF5A3C" />
        <path d="M 10 20 Q 4 14 12 12 Q 10 20 16 20 Z" fill="#FF5A3C" />
      </g>
      <g transform={rightClawTransform}>
        <circle cx="84" cy="26" r="10" fill="#FF5A3C" />
        <path d="M 90 20 Q 96 14 88 12 Q 90 20 84 20 Z" fill="#FF5A3C" />
      </g>
      {/* Körper */}
      <ellipse cx="50" cy="52" rx="26" ry="18" fill="#FF5A3C" />
      <ellipse cx="50" cy="56" rx="20" ry="11" fill="#E04A2F" opacity="0.55" />
      {/* Augenstiele */}
      <g stroke="#C74A31" strokeWidth="3" strokeLinecap="round">
        <path d="M 42 38 L 40 28" fill="none" />
        <path d="M 58 38 L 60 28" fill="none" />
      </g>
      <circle cx="40" cy="25" r="5" fill="#E6EDF7" />
      <circle cx="60" cy="25" r="5" fill="#E6EDF7" />
      {pose === 'facepalm' ? (
        <g stroke="#0B1220" strokeWidth="2" strokeLinecap="round">
          <path d="M 37 25 L 43 25" fill="none" />
          <path d="M 57 25 L 63 25" fill="none" />
        </g>
      ) : (
        <>
          <circle cx="41" cy="25" r="2.2" fill="#0B1220" />
          <circle cx="59" cy="25" r="2.2" fill="#0B1220" />
        </>
      )}
      {/* Mund */}
      <path d={mouth} stroke="#0B1220" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
