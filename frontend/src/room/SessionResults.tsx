import type { RoomView } from '@pokemon-universe/shared/public';
import { Crown, LogOut, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { audio } from '../audio';
import { cx, Icon, Panel, Pill, ScreenSplit } from '../ui';
import { resultsCue, ResultsStandings } from './ResultsShell';
import { joinNames, sessionPodium } from './session-results';
import s from './SessionResults.module.css';

/**
 * Clasificación final de la sesión (`SESSION_RESULTS`): podio y resto en franjas, la evolución de puntos por partida
 * y, abajo, «Volver al lobby» (el host vuelve al lobby con la clasificación a cero) y «Terminar» (salir de la sala).
 */
export function SessionResults({ room, selfId, onLobby, onLeave }: { room: RoomView; selfId: string; onLobby(): void; /** «Terminar»: salir de la sala. */ onLeave?: () => void }) {
  const podium = sessionPodium(room, selfId);
  const host = room.hostId === selfId;
  const hostName = room.members.find((member) => member.id === room.hostId)?.displayName;
  const gameNames = new Map(room.availableGames.map((game) => [game.id, game.name]));
  const played = room.gamesPlayed > 0;
  // El podio de la sesión: `game.win` al campeón y `game.podium` al resto, solo al llegar.
  const initial = useRef({ podium: true, won: podium.won });
  useEffect(() => {
    const cue = resultsCue(initial.current);
    if (cue) audio.play(cue);
  }, []);

  const top = <div className={s.main}>
    <header className={s.head}>
      <span className={s.trophy}><Icon icon={Trophy} size={32} /></span>
      <div className={s.headText}>
        <span className={s.subtitle}>{podium.subtitle}</span>
        <h1 className={s.title}>{podium.title}</h1>
        {podium.champions.length > 0 && <p className={s.champions}>
          <Icon icon={Crown} size={22} className={s.crown} />
          <span>{joinNames(podium.champions.map((standing) => standing.name))}</span>
          <span className={s.points}>{podium.champions[0]!.points} puntos</span>
        </p>}
      </div>
    </header>
    <Panel title="Clasificación" variant="dark" scroll className={cx(s.standings)} status={played ? null : { kind: 'empty', title: 'Aún no se ha jugado ninguna partida', text: 'La clasificación se llena con cada partida: el puesto en cada una da puntos de sesión.' }}>
      <ResultsStandings standings={podium.standings} selfId={selfId} winnersNeedPoints />
      <p className={s.note}>La sesión premia la posición en cada partida. Los puntos propios de cada minijuego se conservan en sus resultados.</p>
    </Panel>
  </div>;

  const side = room.sessionHistory.length > 0
    ? <Panel title="Evolución de puntos" aria-label="Evolución de puntos" variant="cream" scroll className={cx(s.history)}>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th scope="col" className={s.nameCell}>Entrenador</th>{room.sessionHistory.map((game) => <th scope="col" key={`${game.gameId}-${game.gameNumber}`} title={gameNames.get(game.gameId) ?? game.gameId}>P{game.gameNumber}</th>)}<th scope="col" className={s.total}>Total</th></tr></thead>
          <tbody>{podium.standings.map((member) => <tr key={member.id}>
            <th scope="row" className={s.nameCell}><span className={s.truncate}>{member.name}</span></th>
            {room.sessionHistory.map((game) => {
              const points = game.points[member.id] ?? 0;
              // Como en el podio: sin puntos no hay corona (una partida en la que nadie puntúa no tiene ganador).
              const won = points > 0 && game.winnerIds.includes(member.id);
              return <td key={`${game.gameId}-${game.gameNumber}`} className={cx(won && s.won)} aria-label={`${points} puntos en la partida ${game.gameNumber}${won ? ', ganador' : ''}`}>{won && <Icon icon={Crown} size={18} className={s.cellCrown} />}+{points}</td>;
            })}
            <td className={s.total}>{member.points}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className={s.foot}>P1, P2… son las partidas; la corona marca al ganador. En sesiones largas se muestran las 100 más recientes.</p>
    </Panel>
    : null;

  const action = <Panel variant="cream" as="div" bodyClassName={cx(s.actionBody)}>
    <div className={s.status}>
      <span className={s.kicker}>Fin de la sesión</span>
      <p className={s.actionTitle}>{host ? '¿Volver al lobby?' : `Esperando a ${hostName ?? 'el host'}…`}</p>
      <p className={s.help}>{host ? 'Volvéis al lobby con la misma sala y la clasificación a cero.' : `${hostName ?? 'El host'} decide si jugáis otra sesión.`}</p>
    </div>
    <div className={s.buttons}>
      {host && <Pill variant="yellow" size="main" icon={RotateCcw} onClick={onLobby}>Volver al lobby</Pill>}
      {onLeave && <Pill variant="danger" icon={LogOut} className={s.end} title="Terminar: salir de la sala" onClick={onLeave}><span className={s.endLabel}>Terminar</span></Pill>}
    </div>
  </Panel>;

  return <div className={cx('content-row', s.screen)}>
    <ScreenSplit fill top={top} side={side} bottom={action} />
  </div>;
}
