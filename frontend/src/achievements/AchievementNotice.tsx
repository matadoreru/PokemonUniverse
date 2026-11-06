import { Medal } from 'lucide-react';
import { AchievementTile, cx, Panel, PillLink } from '../ui';
import { achievementArt } from './achievement-art';
import { queueTitle, recordLine } from './achievements-state';
import { useAchievements } from './AchievementsContext';
import s from './AchievementNotice.module.css';

/** Cuántos logros enseña el recuadro; el resto va en «y N más». */
const MAX_TILES = 3;
export const ACHIEVEMENTS_HREF = '/profile?tab=logros';

/**
 * Recuadro de los resultados de una partida (spec §Flujo, punto 7): hasta tres logros recién conseguidos, «y N más», los
 * récords personales y «Ver mis logros». Solo se ve con la cola enseñada en `GAME_RESULTS`; en las demás fases sale el
 * aviso flotante. No es región viva (anuncia la de `ResultsShell`) y no vacía la cola: lo hace `phaseChanged` al salir de
 * los resultados, o «Ver mis logros».
 */
export function AchievementNotice() {
  const { queue, visible, acknowledge } = useAchievements();
  if (!visible || queue.shownIn !== 'GAME_RESULTS') return null;
  const shown = queue.achievements.slice(0, MAX_TILES);
  const more = queue.achievements.length - shown.length;
  return (
    <Panel variant="cream" as="div" title={queueTitle(queue)} className={cx(s.notice)}>
      {shown.length > 0 && (
        <ul className={s.list}>
          {shown.map((achievement) => (
            <AchievementTile key={achievement.id} name={achievement.name} description={achievement.description} state="unlocked" art={achievementArt(achievement)} fresh />
          ))}
        </ul>
      )}
      {more > 0 && <p className={s.more}>y {more} más</p>}
      {queue.records.map((record) => <p key={`${record.gameId}:${record.key}`} className={s.record}>{recordLine(record)}</p>)}
      <PillLink to={ACHIEVEMENTS_HREF} variant="yellow" icon={Medal} className={s.link} onClick={acknowledge}>Ver mis logros</PillLink>
    </Panel>
  );
}
