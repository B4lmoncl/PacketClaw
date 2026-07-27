/**
 * Das Archiv — die gesammelten Feldnotizen.
 *
 * Bewusst kein Spielmodus, sondern ein Ort: hier steht, was man weiß, und was
 * noch fehlt. Die Lücken sind die halbe Funktion. Wer sieht, dass drei von vier
 * „Grundgesetzen" da sind, will das vierte.
 *
 * Die Karten sind gleichzeitig ein Nachschlagewerk: jede enthält eine Aussage,
 * die auf einer echten FortiGate stimmt. Damit ist das Archiv der einzige
 * Sammel-Mechanismus im Spiel, der beim Weglegen des Spiels noch etwas nützt.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collectionProgress,
  NOTE_RARITIES,
  NOTE_TOPICS,
  sortedCollection,
  topicProgress,
  type NoteRarity,
  type NoteTopic,
} from '../../game/fieldNotes';
import { useGame } from '../../game/store';
import { FieldNoteCard } from '../components/FieldNoteCard';
import { RewardOverlay } from '../components/RewardOverlay';
import type { RewardPayload } from '../components/RewardOverlay';

type Filter = 'all' | NoteRarity | NoteTopic | 'missing';

export function NotesScreen() {
  const { t } = useTranslation();
  const owned = useGame((s) => s.fieldNotes);
  const claimedSets = useGame((s) => s.claimedNoteSets);
  const claimNoteSet = useGame((s) => s.claimNoteSet);
  const [filter, setFilter] = useState<Filter>('all');
  const [reward, setReward] = useState<RewardPayload | null>(null);

  const sets = useMemo(() => topicProgress(owned, claimedSets), [owned, claimedSets]);

  const progress = useMemo(() => collectionProgress(owned), [owned]);
  const cards = useMemo(() => {
    const all = sortedCollection(owned);
    if (filter === 'all') return all;
    if (filter === 'missing') return all.filter((c) => !c.owned);
    if ((NOTE_TOPICS as readonly string[]).includes(filter)) {
      return all.filter((c) => c.topic === filter);
    }
    return all.filter((c) => c.rarity === filter);
  }, [owned, filter]);

  // Themen zuerst: „wovon handelt das?" ist die naheliegendere Frage als
  // „wie selten ist das?"
  const filters: Filter[] = ['all', ...NOTE_TOPICS, ...NOTE_RARITIES, 'missing'];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-16 pt-6 lg:max-w-7xl lg:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold text-aura lg:text-3xl">
          📓 {t('notes.title')}
        </h1>
        <p className="font-mono text-xs text-dim">{t('notes.sub')}</p>

        <div className="panel-inset flex flex-col gap-2 rounded-panel px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-xs text-ink">
              {t('notes.progress', { owned: progress.owned, total: progress.total })}
            </span>
            <span className="font-mono text-xs tabular-nums text-aura">
              {Math.round(progress.ratio * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-aura to-claw transition-[width] duration-700"
              style={{ width: `${Math.round(progress.ratio * 100)}%` }}
            />
          </div>
          {/* Pro Stufe: die Lücke steht direkt neben dem Besitz */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {NOTE_RARITIES.map((rarity) => (
              <span
                key={rarity}
                className={`rarity-${rarity} font-mono text-[10px] tabular-nums text-rarity`}
              >
                {t(`notes.rarity.${rarity}`)} {progress.byRarity[rarity].owned}/
                {progress.byRarity[rarity].total}
              </span>
            ))}
          </div>
          {progress.complete && (
            <p className="font-mono text-[11px] text-trace">
              {t('notes.complete', { total: progress.total })}
            </p>
          )}
        </div>

        {/* Drei Saetze statt einer fernen Ziellinie: der kleinste ist frueh
            drin und beweist, dass es die Belohnung wirklich gibt. */}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {sets.map((set) => (
            <li
              key={set.topic}
              className={`flex items-center gap-3 rounded-panel px-3 py-2.5 ${
                set.complete && !set.claimed
                  ? 'panel-reward rarity-legendary animate-pulse-soft'
                  : 'panel-inset'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-display text-xs font-bold text-ink">
                    {t(`notes.topic.${set.topic}`)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-dim">
                    {set.owned}/{set.total}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg/80">
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ${
                      set.complete ? 'bg-trace' : 'bg-aura/70'
                    }`}
                    style={{ width: `${Math.round((set.owned / Math.max(1, set.total)) * 100)}%` }}
                  />
                </div>
              </div>
              {set.complete && !set.claimed ? (
                <button
                  onClick={() => {
                    const got = claimNoteSet(set.topic, set.bonus);
                    if (got !== null) setReward({ kind: 'chest', xp: got, rarity: 'epic' });
                  }}
                  className="shrink-0 rounded-row bg-warn px-2.5 py-1 font-display text-[11px] font-bold text-bg hover:brightness-110"
                >
                  +{set.bonus}
                </button>
              ) : set.claimed ? (
                <span className="shrink-0 font-mono text-[10px] text-trace">✓</span>
              ) : (
                <span className="shrink-0 font-mono text-[10px] text-dim/60">+{set.bonus}</span>
              )}
            </li>
          ))}
        </ul>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-row border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              filter === f
                ? 'border-aura bg-aura/15 text-aura'
                : 'border-line text-dim hover:text-ink'
            }`}
          >
            {f === 'all'
              ? t('notes.filterAll')
              : f === 'missing'
                ? t('notes.filterMissing')
                : (NOTE_TOPICS as readonly string[]).includes(f)
                  ? t(`notes.topic.${f}`)
                  : t(`notes.rarity.${f}`)}
          </button>
        ))}
      </div>

      {cards.length === 0 ? (
        <p className="panel-inset rounded-panel px-4 py-6 text-center font-mono text-xs text-dim">
          {progress.owned === 0 ? t('notes.empty') : t('notes.filterNothing')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <li key={card.id} className="h-full">
              <FieldNoteCard note={card} owned={card.owned} />
            </li>
          ))}
        </ul>
      )}

      <RewardOverlay reward={reward} onClose={() => setReward(null)} />
    </div>
  );
}
