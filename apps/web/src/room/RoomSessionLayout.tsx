import { Outlet } from 'react-router-dom';
import { RoomProvider } from './RoomContext';

export function RoomSessionLayout() {
  return <RoomProvider><Outlet /></RoomProvider>;
}
