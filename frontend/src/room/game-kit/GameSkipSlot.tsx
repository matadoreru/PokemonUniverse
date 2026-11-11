import { cx } from '../../ui';
import { RevealNextControl } from '../RevealNextControl';
import { useRoom } from '../RoomContext';
import { SkipGameControl } from '../SkipGameControl';
import s from './GameSkipSlot.module.css';

/**
 * Controles de sala dentro de la pantalla de un juego (ver `GAMES_WITH_SKIP_IN_SCREEN`): «Siguiente» en los revelados
 * (`revealSkip`, también en el reto diario) y «Saltar minijuego». En el reto diario no hay votación de salto: la sala
 * lleva el estado de salto (de él sale el id de la partida), pero el reto no se salta. Sin ninguno de los dos, nada.
 */
export function GameSkipSlot({ className }: { className?: string | undefined }) {
  const { room, selfId, connected, setGameSkipVote, revealNext } = useRoom();
  const state = room?.gameSkipState;
  const reveal = room?.revealSkip;
  const epoch = room?.gameActionEpoch;
  const next = reveal && state && epoch
    ? <RevealNextControl key={`${state.gameInstanceId}:${epoch}`} reveal={reveal} selfId={selfId} connected={connected} onNext={() => revealNext(state.gameInstanceId, epoch)} />
    : null;
  const skip = state && !room.daily
    ? <SkipGameControl key={`${state.gameInstanceId}:${connected}`} state={state} connected={connected} onSetVote={setGameSkipVote} />
    : null;
  if (!next && !skip) return null;
  return <div className={cx(s.slot, className)}>{next}{skip}</div>;
}
