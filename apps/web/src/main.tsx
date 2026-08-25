import { lazy, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { HomePage } from './screens/HomePage';
import './styles.css';

const AuthPage = lazy(() => import('./screens/AuthPage').then((module) => ({ default: module.AuthPage })));
const PlayPage = lazy(() => import('./screens/PlayPage').then((module) => ({ default: module.PlayPage })));
const ProfilePage = lazy(() => import('./screens/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const RoomPage = lazy(() => import('./screens/RoomPage').then((module) => ({ default: module.RoomPage })));
const RoomSessionLayout = lazy(() => import('./room/RoomSessionLayout').then((module) => ({ default: module.RoomSessionLayout })));

const protectedPage = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;
const router = createBrowserRouter([{ element: <Layout />, children: [
  { path: '/', element: <HomePage /> }, { path: '/auth', element: <AuthPage /> },
  { path: '/profile', element: protectedPage(<ProfilePage />) },
  { element: protectedPage(<RoomSessionLayout />), children: [
    { path: '/play', element: <PlayPage /> }, { path: '/room', element: <RoomPage /> },
  ] },
] }]);

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><RouterProvider router={router} /></AuthProvider></StrictMode>);
