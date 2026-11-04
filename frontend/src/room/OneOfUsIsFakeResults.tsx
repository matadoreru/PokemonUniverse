import type { OneOfUsIsFakePublicState, RoomView } from '@pokemon-universe/shared/public';
import { Equal, Search, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { Chip, Icon } from '../ui';
import { guessTop } from './guess-kit';
import { playerColor } from './player-color';
import { sharesPosition } from './results-ties';
import { ResultsHostActions, ResultsRecords } from './ResultsRecords';
import { ResultsShell, type ResultsStanding } from './ResultsShell';
import s from '../games/one-of-us-is-fake/OneOfUsIsFake.module.css';

type Stats = NonNullable<OneOfUsIsFakePublicState['results']>['standings'][number]['stats'];
const num = (stats: Stats, key: string) => Number(stats[key] ?? 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Línea de métricas en texto: victorias como normal y como fake, votos correctos, veces fake y descubierto. */
export function fakeStatsLine(stats: Stats): string {
  return [
    plural(num(stats, 'victoriesAsNormal'), 'victoria como normal', 'victorias como normal'),
    plural(num(stats, 'victoriesAsFake'), 'como fake', 'como fake'),
    plural(num(stats, 'correctVotes'), 'voto correcto', 'votos correctos'),
    `fake ${plural(num(stats, 'timesFake'), 'vez', 'veces')}`,
    `${num(stats, 'fakeDiscovered')} ${num(stats, 'fakeDiscovered') === 1 ? 'descubierto' : 'descubiertos'}`,
  ].join(' · ');
}

/**
 * Resultados de One of Us Is Fake: la clasificación del catálogo (`ResultsShell` con `standings`: podio, ganador con
 * insignia y «+N» y, en texto, victorias como normal y como fake, votos correctos y veces fake), la regla de puntos y,
 * al lado, los récords (mejor fake, mejor detective y más veces fake; empates juntos). Abajo, la acción del host.
 * Un empate a cero no corona.
 */
export function OneOfUsIsFakeResults({ room, selfId, onLobby, onEnd }: { room: RoomView; selfId: string; onLobby(): void; onEnd(): void }) {
  const game = room.game as OneOfUsIsFakePublicState;
  const host = room.hostId === selfId;
  const standings = game.results?.standings ?? [];
  const nameOf = (playerId: string) => room.members.find((member) => member.id === playerId)?.displayName ?? 'Entrenador';
  const positions = standings.map((standing) => ({ id: standing.playerId, position: standing.position }));
  const rows: ResultsStanding[] = standings.map((standing) => {
    const index = room.members.findIndex((member) => member.id === standing.playerId);
    return {
      id: standing.playerId,
      position: standing.position,
      name: nameOf(standing.playerId),
      points: standing.points,
      avatar: room.members[index]?.avatar,
      color: playerColor(Math.max(0, index)),
      meta: <>{sharesPosition(positions, standing.playerId, () => standing.points, true) && <Chip tone="warn" icon={<Icon icon={Equal} size={18} />}>Empate</Chip>}<span>{fakeStatsLine(standing.stats)}</span></>,
    };
  });
  const entries = standings.map((standing) => ({ name: nameOf(standing.playerId), stats: standing.stats }));
  const fake = guessTop(entries, 'victoriesAsFake');
  const detective = guessTop(entries, 'correctVotes');
  const often = guessTop(entries, 'timesFake');
  const aside = <ResultsRecords id="fake-records-title" records={[
    { key: 'fake', title: 'Mejor fake', icon: ShieldAlert, names: fake?.names ?? null, value: String(fake?.value ?? ''), unit: fake?.value === 1 ? 'victoria como fake' : 'victorias como fake' },
    { key: 'detective', title: 'Mejor detective', icon: Search, names: detective?.names ?? null, value: String(detective?.value ?? ''), unit: detective?.value === 1 ? 'voto correcto' : 'votos correctos' },
    { key: 'often', title: 'Más veces fake', icon: ShieldQuestion, names: often?.names ?? null, value: String(often?.value ?? ''), unit: often?.value === 1 ? 'ronda como fake' : 'rondas como fake' },
  ]} />;
  return <ResultsShell won={(game.results?.winnerId ?? null) === selfId} title="Una partida de sospechas" subtitle={`One of Us Is Fake · ${game.totalRounds} ${game.totalRounds === 1 ? 'ronda' : 'rondas'}`}
    standings={rows} selfId={selfId} winnersNeedPoints aside={aside} actions={<ResultsHostActions room={room} host={host} onLobby={onLobby} onEnd={onEnd} waitingText="Esperando a que el host continúe la sesión…" />} fillLarge>
    <p className={s.rule}>Si el grupo expulsa al fake, cada normal gana 2 puntos; si el fake se libra, gana 4.</p>
  </ResultsShell>;
}
