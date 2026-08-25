import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Lobby } from '../room/Lobby';
import { NextGameVote } from '../room/NextGameVote';
import { SessionResults } from '../room/Results';
import { useRoom } from '../room/RoomContext';
import { clientGameRegistry } from '../games/registry';

export function RoomPage() {
  const { user } = useAuth(); const context = useRoom(); const navigate = useNavigate(); const room = context.room;
  if (!user) return null;
  if (!room) return <Navigate to="/play" replace />;
  const activeGameId = (room.game as { gameId?: string } | null)?.gameId ?? room.selectedGameId;
  const gameClient = clientGameRegistry.get(activeGameId);
  if (room.phase === 'LOBBY') return <Lobby room={room} selfId={user.id} onLeave={() => void context.leaveRoom().then(() => navigate('/play'))} onStart={context.startGame} onSelectGame={context.selectGame} onConfig={context.updateConfig} onSession={context.updateSession} onGameSelection={context.updateGameSelection} onSetRoomRole={context.setRoomRole} onTransferHost={context.transferHost} onKick={context.kick} onEndSession={() => void context.endSession()} />;
  if (room.phase === 'NEXT_GAME_VOTE' || room.phase === 'NEXT_GAME_VOTE_RESULTS') return <NextGameVote room={room} selfId={user.id} onVote={context.voteNextGame} onEnd={() => void context.endSession()} />;
  if (room.phase === 'GAME_RESULTS') return <gameClient.Results room={room} selfId={user.id} onLobby={() => void context.returnLobby()} onEnd={() => void context.endSession()} />;
  if (room.phase === 'SESSION_RESULTS') return <SessionResults room={room} selfId={user.id} onLobby={() => void context.returnLobby()} />;
  return <gameClient.ActiveGame room={room} selfId={user.id} onAction={context.gameAction} />;
}
