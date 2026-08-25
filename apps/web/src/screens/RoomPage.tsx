import { Suspense } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { GameLoadingFallback } from '../components/LoadingFallback';
import { Lobby } from '../room/Lobby';
import { NextGameVote } from '../room/NextGameVote';
import { SessionResults } from '../room/SessionResults';
import { useRoom } from '../room/RoomContext';
import { clientGameRegistry } from '../games/registry';

export function RoomPage() {
  const { user } = useAuth(); const context = useRoom(); const navigate = useNavigate(); const room = context.room;
  if (!user) return null;
  if (!room) return <Navigate to="/play" replace />;
  const run = (operation: Promise<unknown>) => { void operation.catch(() => undefined); };
  const activeGameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  const gameClient = clientGameRegistry.get(activeGameId);
  if (room.phase === 'LOBBY') return <Lobby room={room} selfId={user.id} onLeave={() => run(context.leaveRoom().then(() => navigate('/play')))} onReady={context.setReady} onStart={context.startGame} onSelectGame={context.selectGame} onConfig={context.updateConfig} onSession={context.updateSession} onGameSelection={context.updateGameSelection} onSetRoomRole={context.setRoomRole} onTransferHost={context.transferHost} onKick={context.kick} onEndSession={() => run(context.endSession())} />;
  if (room.phase === 'NEXT_GAME_VOTE' || room.phase === 'NEXT_GAME_VOTE_RESULTS') return <NextGameVote room={room} selfId={user.id} onVote={context.voteNextGame} onEnd={() => run(context.endSession())} />;
  if (room.phase === 'GAME_RESULTS') return <Suspense fallback={<GameLoadingFallback />}><gameClient.Results room={room} selfId={user.id} onLobby={() => run(context.continueSession())} onEnd={() => run(context.endSession())} /></Suspense>;
  if (room.phase === 'SESSION_RESULTS') return <SessionResults room={room} selfId={user.id} onLobby={() => run(context.returnLobby())} />;
  return <Suspense fallback={<GameLoadingFallback />}><gameClient.ActiveGame room={room} selfId={user.id} onAction={context.gameAction} /></Suspense>;
}
