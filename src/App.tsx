import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { setSoundEnabled } from './game/sound';
import { useTranslation } from 'react-i18next';
import { getLevel } from './game/levels';
import { useGame } from './game/store';
import { Header } from './ui/components/Header';
import { ArchitectScreen } from './ui/screens/ArchitectScreen';
import { AchievementToast } from './ui/components/AchievementToast';
import { AuditScreen } from './ui/screens/AuditScreen';
import { IncidentScreen } from './ui/screens/IncidentScreen';
import { ChapterScreen } from './ui/screens/ChapterScreen';
import { DailyScreen } from './ui/screens/DailyScreen';
import { EndlessScreen } from './ui/screens/EndlessScreen';
import { ChallengeScreen } from './ui/screens/ChallengeScreen';
import { ProfileScreen } from './ui/screens/ProfileScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { OnboardingScreen } from './ui/screens/OnboardingScreen';
import { SandboxScreen } from './ui/screens/SandboxScreen';
import { VerdictScreen } from './ui/screens/VerdictScreen';
import { useReducedMotionPref } from './ui/hooks/useReducedMotionPref';

export default function App() {
  const screen = useGame((s) => s.screen);
  const locale = useGame((s) => s.settings.locale);
  const sound = useGame((s) => s.settings.sound);
  const scanlines = useGame((s) => s.settings.scanlines);
  const onboarded = useGame((s) => s.onboarded);
  const navigate = useGame((s) => s.navigate);
  const { i18n } = useTranslation();
  const reducedMotion = useReducedMotionPref();

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  useEffect(() => {
    setSoundEnabled(sound);
  }, [sound]);

  // Deep-Links: #level/<id> und #chapter/<n> (Dev, Teilen, PWA-Shortcuts)
  useEffect(() => {
    const hash = window.location.hash;
    const levelMatch = /^#level\/(.+)$/.exec(hash);
    if (levelMatch && getLevel(levelMatch[1] ?? '')) {
      navigate({ name: 'level', levelId: levelMatch[1] as string });
      return;
    }
    const chapterMatch = /^#chapter\/(\d+)$/.exec(hash);
    if (chapterMatch) navigate({ name: 'chapter', chapter: Number(chapterMatch[1]) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let content: React.ReactNode;
  let onBack: (() => void) | undefined;

  switch (screen.name) {
    case 'home':
      content = onboarded ? <HomeScreen /> : <OnboardingScreen />;
      break;
    case 'daily':
      content = <DailyScreen />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'endless':
      content = <EndlessScreen />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'challenge':
      content = <ChallengeScreen />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'sandbox':
      content = <SandboxScreen />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'profile':
      content = <ProfileScreen />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'settings':
      content = <SettingsScreen />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'chapter':
      content = <ChapterScreen chapter={screen.chapter} />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'level': {
      const level = getLevel(screen.levelId);
      if (!level) {
        content = <HomeScreen />;
        break;
      }
      onBack = () => navigate({ name: 'chapter', chapter: level.chapter });
      content =
        level.mode === 'verdict' ? (
          <VerdictScreen key={level.id} level={level} />
        ) : level.mode === 'architect' ? (
          <ArchitectScreen key={level.id} level={level} />
        ) : level.mode === 'audit' ? (
          <AuditScreen key={level.id} level={level} />
        ) : (
          <IncidentScreen key={level.id} level={level} />
        );
      break;
    }
  }

  return (
    <div className="min-h-screen bg-bg font-body text-ink pc-bg-gradient">
      <Header onBack={onBack} />
      <AchievementToast />
      {/* Sanfter Einblend-Uebergang pro Screen (QuestHall-Anleihe) */}
      <main>
        <motion.div
          key={JSON.stringify(screen)}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {content}
        </motion.div>
      </main>
      {scanlines && <div className="pc-scanlines" aria-hidden />}
    </div>
  );
}
