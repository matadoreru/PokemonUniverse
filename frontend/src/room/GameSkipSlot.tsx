import { cx } from '../ui';
import { useRoom } from './RoomContext';
import { SkipGameControl } from './SkipGameControl';
import s from './GameSkipSlot.module.css';

/** «Saltar minijuego» dentro de la pantalla de un juego (ver `GAMES_WITH_SKIP_IN_SCREEN`); sin votación, nada. */
export function GameSkipSlot({ className }: { className?: string | undefined }) {
  const { room, connected, setGameSkipVote } = useRoom();
  const state = room?.gameSkipState;
  if (!state) return null;
  return <div className={cx(s.slot, className)}><SkipGameControl key={`${state.gameInstanceId}:${connected}`} state={state} connected={connected} onSetVote={setGameSkipVote} /></div>;
}
