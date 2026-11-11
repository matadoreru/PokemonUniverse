import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { GameLoad } from '../components/LoadingFallback';
import { DailyResultsScreen } from '../daily/DailyResultsScreen';
import { Lobby } from '../room/Lobby';
import { NextGameVote } from '../room/NextGameVote';
import { SessionResults } from '../room/SessionResults';
import { useRoom } from '../room/RoomContext';
import { ConfirmDialog } from '../ui';
import { clientGameRegistry } from '../games/registry';
import { PhaseTransition } from '../room/PhaseTransition';
import type { RoomView } from '@pokemon-universe/shared/public';

/**
 * Confirmación de «Terminar sesión» (lobby, votación del siguiente juego y resultados de cada partida): la sesión acaba
 * para toda la sala y no se deshace. «Cancelar» va primero y con el foco.
 */
export function EndSessionDialog({ open, onClose, onConfirm }: { open: boolean; onClose(): void; onConfirm(): void }) {
  return <ConfirmDialog open={open} title="¿Terminar la sesión?" onClose={onClose} confirmLabel="Terminar sesión" onConfirm={onConfirm}>
    <p>La sesión acaba para toda la sala y se enseña la clasificación final. No se puede deshacer.</p>
  </ConfirmDialog>;
}

export function RoomPage() {
  const { user } = useAuth(); const context = useRoom(); const room = context.room;
  if (!user) return null;
  if (!room) return <Navigate to="/play" replace />;
  // Entrada suave al cambiar de pantalla (sala, partida, resultados, votación, sesión); nunca entre rondas.
  return <PhaseTransition room={room}><RoomPhaseScreen room={room} userId={user.id} /></PhaseTransition>;
}

function RoomPhaseScreen({ room, userId }: { room: RoomView; userId: string }) {
  const context = useRoom(); const navigate = useNavigate();
  // La fase en la que se pidió terminar: en otra fase (o tras otra partida) el diálogo ya no está abierto.
  const [endAskedAt, setEndAskedAt] = useState<string | null>(null);
  const run = (operation: Promise<unknown>) => { void operation.catch(() => undefined); };
  const phaseKey = `${room.phase}:${room.gamesPlayed}`;
  const askEnd = () => setEndAskedAt(phaseKey);
  // Va junto al lobby, la votación y los resultados, que es donde se puede terminar.
  const endDialog = <EndSessionDialog open={endAskedAt === phaseKey} onClose={() => setEndAskedAt(null)} onConfirm={() => run(context.endSession())} />;
  const activeGameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  const gameClient = clientGameRegistry.get(activeGameId);
  if (room.phase === 'LOBBY') return <>{endDialog}<Lobby room={room} selfId={userId} onReady={context.setReady} onStart={context.startGame} onGameConfig={context.updateGameConfig} onSession={context.updateSession} onGameSelection={context.updateGameSelection} onAllowedModes={context.updateAllowedModes} onSetRoomRole={context.setRoomRole} onTransferHost={context.transferHost} onKick={context.kick} onEndSession={askEnd} chat={context.chat} chatHistoryVersion={context.chatHistoryVersion} onSendChat={context.sendChat} onDeleteChatMessage={context.deleteChatMessage} onSetChatMute={context.setChatMute} /></>;
  if (room.phase === 'NEXT_GAME_VOTE' || room.phase === 'NEXT_GAME_VOTE_RESULTS') return <>{endDialog}<NextGameVote room={room} selfId={userId} onVote={context.voteNextGame} onEnd={askEnd} /></>;
  // El reto diario acaba en su propia pantalla de resultados; «Volver a Jugar» cierra la sala.
  if (room.phase === 'GAME_RESULTS' && room.daily) return <DailyResultsScreen room={room} onLeave={() => run(context.leaveRoom().then(() => navigate('/play')))} />;
  // Un fallo al cargar el código del juego enseña su error con «Reintentar»; otra fase u otro juego lo olvida.
  const loadKey = `${room.phase}:${activeGameId}`;
  if (room.phase === 'GAME_RESULTS') return <>{endDialog}<GameLoad resetKey={loadKey}><gameClient.Results room={room} selfId={userId} onLobby={() => run(context.continueSession())} onEnd={askEnd} /></GameLoad></>;
  if (room.phase === 'SESSION_RESULTS') return <SessionResults room={room} selfId={userId} onLobby={() => run(context.returnLobby())} onLeave={() => run(context.leaveRoom().then(() => navigate('/play')))} />;
  return <GameLoad resetKey={loadKey}><gameClient.ActiveGame key={room.gameSkipState?.gameInstanceId} room={room} selfId={userId} onAction={context.gameAction} /></GameLoad>;
}
