/**
 * Eine Feldnotiz als Sammelkarte.
 *
 * Nutzt das bestehende Rarity-Material (.panel-reward + .rarity-*), damit die
 * Karten dieselbe Sprache sprechen wie Truhen und Abzeichen — eine zweite
 * Kartensprache im selben Spiel wäre genau die Monotonie, die abgeschafft
 * wurde.
 *
 * Die FEHLENDEN Karten sind hier so wichtig wie die vorhandenen: eine Sammlung
 * ohne sichtbare Lücken ist kein Grund zurückzukommen. Deshalb hat die
 * verschlossene Karte dieselbe Größe und denselben Rahmen, nur ohne Inhalt —
 * man sieht, dass dort etwas fehlt, und welche Stufe es hat.
 */
import { useTranslation } from 'react-i18next';
import type { FieldNote } from '../../game/fieldNotes';

interface Props {
  note: FieldNote;
  owned: boolean;
  /** Kompakt = Sammlungsraster; groß = frisch aus der Truhe */
  size?: 'compact' | 'full';
}

export function FieldNoteCard({ note, owned, size = 'compact' }: Props) {
  const { t } = useTranslation();
  const full = size === 'full';

  if (!owned) {
    return (
      <article
        className={`panel-reward rarity-${note.rarity} flex h-full flex-col justify-between rounded-panel px-3 py-2.5 opacity-40 grayscale`}
        aria-label={t('notes.locked')}
      >
        <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
          {t(`notes.rarity.${note.rarity}`)}
        </div>
        <div className="flex items-center gap-2 py-1.5">
          <span className="text-lg" aria-hidden>
            🔒
          </span>
          <span className="font-display text-sm font-bold text-dim">{t('notes.locked')}</span>
        </div>
        <div className="font-mono text-[9px] text-dim/70">{t('notes.lockedHint')}</div>
      </article>
    );
  }

  return (
    <article
      // text-left, weil die Karte auch in zentrierten Bühnen (Truhen-Overlay)
      // vorkommt und Prosa mittig gesetzt schlechter zu lesen ist
      className={`panel-reward rarity-${note.rarity} flex h-full flex-col gap-1.5 rounded-panel text-left ${
        full ? 'px-5 py-4' : 'px-3 py-2.5'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-rarity">
          {t(`notes.rarity.${note.rarity}`)}
        </span>
        {/* Karten ohne Verdict-Konzept (DHCP/DNS/HA) nennen ihr Thema — sonst
            stünde dort „mastery.concept.undefined" */}
        <span className="font-mono text-[9px] uppercase tracking-widest text-dim/60">
          {note.concept ? t(`mastery.concept.${note.concept}`) : t(`notes.topic.${note.topic}`)}
        </span>
      </div>
      <h3 className={`font-display font-bold text-ink ${full ? 'text-xl' : 'text-sm'}`}>
        {t(`notes.card.${note.id}.title`)}
      </h3>
      <p
        className={`font-mono leading-relaxed text-dim ${
          full ? 'text-xs' : 'text-[10px] leading-snug'
        }`}
      >
        {t(`notes.card.${note.id}.body`)}
      </p>
    </article>
  );
}
