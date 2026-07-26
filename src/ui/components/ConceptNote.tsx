/**
 * Die Feldnotiz zum gerade gescheiterten Konzept.
 *
 * Der Moment nach einer falschen Antwort ist der einzige, in dem eine
 * Erklärung wirklich gelesen wird. Genau dort steht deshalb die Karte, die
 * dieses Konzept behandelt — die Sammlung hört auf, bloß Sammlung zu sein, und
 * wird zu dem, was sie vorgibt zu sein: Betriebswissen an der Stelle, wo man
 * es braucht.
 *
 * Fehlt die Karte noch, wird das GESAGT statt verschwiegen. Ein Hinweis auf
 * eine Karte, die es zu holen gibt, ist ein Grund weiterzuspielen; eine leere
 * Stelle ist keiner.
 */
import { useTranslation } from 'react-i18next';
import { notesForConcept } from '../../game/fieldNotes';
import type { Concept } from '../../game/mastery';
import { useGame } from '../../game/store';
import { FieldNoteCard } from './FieldNoteCard';

interface Props {
  concept: Concept;
}

export function ConceptNote({ concept }: Props) {
  const { t } = useTranslation();
  const owned = useGame((s) => s.fieldNotes);

  const candidates = notesForConcept(concept);
  if (candidates.length === 0) return null;

  // Die besessene Karte mit dem höchsten Rang zuerst — die trägt die
  // grundlegendste Aussage zum Konzept
  const rank = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;
  const mine = candidates
    .filter((n) => owned.includes(n.id))
    .sort((a, b) => rank[a.rarity] - rank[b.rarity]);
  const note = mine[0];

  if (!note) {
    return (
      <p className="font-mono text-[10px] leading-relaxed text-dim/70">
        📓 {t('notes.hasOneFor', { count: candidates.length })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-dim/60">
        {t('notes.fromArchive')}
      </span>
      <FieldNoteCard note={note} owned />
    </div>
  );
}
