/**
 * Maskottchen: Der Torwächter des Venennetzes — Portrait aus dem
 * Schwesterprojekt QuestHall (eigenes Artwork von B4lmoncl, kein Fremd-Asset).
 * Als runder Avatar; die Pose faerbt nur den Ring (happy=trace, snip=deny …),
 * damit Debrief/Toast weiterhin Feedback geben.
 */
import { useTranslation } from 'react-i18next';
import gatekeeper from '../../assets/mascot-gatekeeper.png';

export type MascotPose = 'idle' | 'happy' | 'snip' | 'facepalm';

const POSE_RING: Record<MascotPose, string> = {
  idle: 'ring-line',
  happy: 'ring-trace/70',
  snip: 'ring-deny/70',
  facepalm: 'ring-warn/70',
};

export function Mascot({ pose = 'idle', size = 64 }: { pose?: MascotPose; size?: number }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded-full bg-panel ring-2 ${POSE_RING[pose]}`}
      style={{ width: size, height: size }}
    >
      <img
        src={gatekeeper}
        alt={t('app.mascotAria')}
        width={size}
        height={size}
        className="h-full w-full object-cover object-top"
      />
    </span>
  );
}
