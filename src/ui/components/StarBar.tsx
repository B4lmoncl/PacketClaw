import { motion } from 'framer-motion';

/** 0–3 Sterne; QuestHall-Anleihe: Star-Earn-Animation beim Erscheinen. */
export function StarBar({
  stars,
  size = 16,
  animated = false,
}: {
  stars: number;
  size?: number;
  animated?: boolean;
}) {
  return (
    <div className="flex gap-1" role="img" aria-label={`${stars} / 3`}>
      {[1, 2, 3].map((slot) => {
        const earned = stars >= slot;
        const star = (
          <svg key={slot} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 2.5 14.9 8.6 21.5 9.5 16.7 14.1 17.9 20.7 12 17.5 6.1 20.7 7.3 14.1 2.5 9.5 9.1 8.6 Z"
              fill={earned ? '#FFB020' : 'none'}
              stroke={earned ? '#FFB020' : '#8A97AD'}
              strokeWidth="1.5"
            />
          </svg>
        );
        if (!animated || !earned) return star;
        return (
          <motion.span
            key={slot}
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15 * slot, type: 'spring', stiffness: 300, damping: 14 }}
          >
            {star}
          </motion.span>
        );
      })}
    </div>
  );
}
