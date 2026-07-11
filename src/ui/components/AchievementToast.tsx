/**
 * Toast bei frisch freigeschalteten Achievements — mit Rarity-Glow
 * (QuestHall-Anleihe). Erfolgsmomente dürfen groß sein.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ACHIEVEMENTS } from '../../game/progression';
import { playAchievement } from '../../game/sound';
import { useGame } from '../../game/store';
import { colors } from '../../theme/tokens';
import { Mascot } from './Mascot';

export function AchievementToast() {
  const { i18n, t } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'de';
  const lastUnlocked = useGame((s) => s.lastUnlocked);
  const clearUnlocked = useGame((s) => s.clearUnlocked);
  const sound = useGame((s) => s.settings.sound);

  useEffect(() => {
    if (lastUnlocked.length === 0) return;
    if (sound) playAchievement();
    const timer = window.setTimeout(clearUnlocked, 4200);
    return () => window.clearTimeout(timer);
  }, [lastUnlocked, clearUnlocked, sound]);

  const achievements = lastUnlocked
    .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter((a) => a !== undefined);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-14 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence>
        {achievements.map((achievement) => {
          const glow = colors.rarity[achievement.rarity];
          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-3 rounded-panel border bg-panel px-4 py-2.5"
              style={{ borderColor: glow, boxShadow: `0 0 18px ${glow}55` }}
            >
              <Mascot pose="happy" size={36} />
              <div>
                <div
                  className="font-mono text-[9px] uppercase tracking-widest"
                  style={{ color: glow }}
                >
                  {t('profile.achievementUnlocked')} · {t(`profile.rarity.${achievement.rarity}`)}
                </div>
                <div className="font-display text-sm font-bold text-ink">
                  {achievement.title[locale]}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
