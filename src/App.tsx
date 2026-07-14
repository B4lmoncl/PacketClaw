import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { setSoundEnabled } from './game/sound';
import { useTranslation } from 'react-i18next';
import { getLevel } from './game/levels';
import { useGame } from './game/store';
import { Header } from './ui/components/Header';
import { ArchitectScreen } from './ui/screens/ArchitectScreen';
import { AchievementToast } from './ui/components/AchievementToast';
import { AmbientBackground } from './ui/components/AmbientBackground';
import { BootSplash } from './ui/components/BootSplash';
import { Hyperdrive } from './ui/components/Hyperdrive';
import { AuditScreen } from './ui/screens/AuditScreen';
import { IncidentScreen } from './ui/screens/IncidentScreen';
import { ChapterScreen } from './ui/screens/ChapterScreen';
import { DailyScreen } from './ui/screens/DailyScreen';
import { BlitzScreen } from './ui/screens/BlitzScreen';
import { EndlessScreen } from './ui/screens/EndlessScreen';
import { MatchCheckScreen } from './ui/screens/MatchCheckScreen';
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

  // Tiefe für die Übergangs-Richtung: tiefer rein → „eintauchen" (Zoom vor),
  // zurück → „auftauchen" (Zoom raus). home = 0, Modi = 1, Level = 2.
  const depth = screen.name === 'home' ? 0 : screen.name === 'level' ? 2 : 1;
  const prevDepth = useRef(depth);
  const dir = depth >= prevDepth.current ? 1 : -1;
  useEffect(() => {
    prevDepth.current = depth;
  }, [depth]);

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
    case 'blitz':
      content = <BlitzScreen />;
      onBack = () => navigate({ name: 'home' });
      break;
    case 'matchcheck':
      content = <MatchCheckScreen />;
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
      {/* Ambient-Ebenen hinter allem; Inhalt liegt in eigener Ebene darueber */}
      <AmbientBackground />
      <BootSplash />
      <Hyperdrive />
      <div className="relative z-10">
        <Header onBack={onBack} />
        <AchievementToast />
        {/* Cinematischer Screen-Wechsel: leichtes Zoomen + Focus-Pull, je nach
            Richtung eintauchen (rein) oder auftauchen (zurück) */}
        <main>
          <motion.div
            key={JSON.stringify(screen)}
            initial={
              reducedMotion
                ? false
                : { opacity: 0, scale: dir === 1 ? 0.96 : 1.04, filter: 'blur(6px)' }
            }
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {content}
          </motion.div>
        </main>
      </div>
      {scanlines && <div className="pc-scanlines" aria-hidden />}
    </div>
  );
}
