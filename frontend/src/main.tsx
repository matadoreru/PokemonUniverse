import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ChangelogProvider } from './changelog/ChangelogContext';
import { SessionRoot } from './components/SessionRoot';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';
import { HomePage } from './screens/HomePage';
import { RotationPreview } from './screens/RotationPreview';
import './styles.css';

const AuthPage = lazy(() => import('./screens/AuthPage').then((module) => ({ default: module.AuthPage })));
const PlayPage = lazy(() => import('./screens/PlayPage').then((module) => ({ default: module.PlayPage })));
const ProfilePage = lazy(() => import('./screens/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const PublicProfilePage = lazy(() => import('./screens/PublicProfilePage').then((module) => ({ default: module.PublicProfilePage })));
const RoomPage = lazy(() => import('./screens/RoomPage').then((module) => ({ default: module.RoomPage })));
const RoomSessionLayout = lazy(() => import('./room/RoomSessionLayout').then((module) => ({ default: module.RoomSessionLayout })));
const AdminPage = lazy(() => import('./screens/AdminPage').then((module) => ({ default: module.AdminPage })));
const ChangelogPage = lazy(() => import('./screens/ChangelogPage').then((module) => ({ default: module.ChangelogPage })));
const ForgotPasswordPage = lazy(() => import('./screens/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./screens/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })));
const FeedbackPage = lazy(() => import('./screens/FeedbackPage').then((module) => ({ default: module.FeedbackPage })));

// Galería del catálogo (solo desarrollo): el `import()` va dentro de la rama DEV para que no entre en el bundle.
const Gallery = import.meta.env.DEV ? lazy(() => import('./ui/dev/Gallery').then((module) => ({ default: module.Gallery }))) : null;
const devRoutes = Gallery ? [{ path: '/dev/ui', element: <Suspense fallback={null}><Gallery /></Suspense> }] : [];

const protectedPage = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;
const router = createBrowserRouter([{ element: <SessionRoot />, children: [
  { path: '/', element: <HomePage /> }, { path: '/auth', element: <AuthPage /> },
  { path: '/auth/recuperar', element: <ForgotPasswordPage /> }, { path: '/auth/nueva-contrasena', element: <ResetPasswordPage /> },
  { path: '/changelog', element: <ChangelogPage /> },
  { path: '/rotation-preview', element: <RotationPreview /> },
  { path: '/profile', element: protectedPage(<ProfilePage />) },
  { path: '/u/:username', element: protectedPage(<PublicProfilePage />) },
  { path: '/feedback', element: protectedPage(<FeedbackPage />) },
  { path: '/admin', element: <RequireAdmin><AdminPage /></RequireAdmin> },
  { element: protectedPage(<RoomSessionLayout />), children: [
    { path: '/play', element: <PlayPage /> }, { path: '/room', element: <RoomPage /> },
  ] },
] }, ...devRoutes]);

createRoot(document.getElementById('root')!).render(<StrictMode><AuthProvider><ChangelogProvider><RouterProvider router={router} /></ChangelogProvider></AuthProvider></StrictMode>);
