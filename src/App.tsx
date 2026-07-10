import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getLevel } from './game/levels';
import { useGame } from './game/store';
import { Header } from './ui/components/Header';
import { ChapterScreen } from './ui/screens/ChapterScreen';
import { HomeScreen } from './ui/screens/HomeScreen';
import { VerdictScreen } from './ui/screens/VerdictScreen';

export default function App() {
  const screen = useGame((s) => s.screen);
  const locale = useGame((s) => s.settings.locale);
  const navigate = useGame((s) => s.navigate);
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  let content: React.ReactNode;
  let onBack: (() => void) | undefined;

  switch (screen.name) {
    case 'home':
      content = <HomeScreen />;
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
      // Phase 3 ergänzt Architect/Audit/Incident — bis dahin ist alles Verdict
      content =
        level.mode === 'verdict' ? <VerdictScreen key={level.id} level={level} /> : <HomeScreen />;
      break;
    }
  }

  return (
    <div className="min-h-screen bg-bg font-body text-ink pc-bg-gradient">
      <Header onBack={onBack} />
      <main>{content}</main>
    </div>
  );
}
