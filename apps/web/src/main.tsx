import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { RoomProvider } from './room/RoomContext';
import { AuthPage } from './screens/AuthPage';
import { HomePage } from './screens/HomePage';
import { PlayPage } from './screens/PlayPage';
import { ProfilePage } from './screens/ProfilePage';
import { RoomPage } from './screens/RoomPage';
import './styles.css';

const protectedPage = (page: React.ReactNode) => <RequireAuth>{page}</RequireAuth>;
const router = createBrowserRouter([{ element: <Layout />, children: [
  { path: '/', element: <HomePage /> }, { path: '/auth', element: <AuthPage /> },
  { path: '/play', element: protectedPage(<PlayPage />) }, { path: '/room', element: protectedPage(<RoomPage />) },
  { path: '/profile', element: protectedPage(<ProfilePage />) },
] }]);

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><RoomProvider><RouterProvider router={router} /></RoomProvider></AuthProvider></StrictMode>);
