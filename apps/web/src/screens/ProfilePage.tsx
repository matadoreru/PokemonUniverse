import { BarChart3, Crosshair, Gamepad2, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

interface Profile { username: string; email: string; createdAt: string; stats: { gamesPlayed: number; gamesWon: number; totalPoints: number } | null; gameStats: Array<{ gameId: string; gamesPlayed: number; gamesWon: number; metrics: Record<string, number> }> }

export function ProfilePage() {
  const { user } = useAuth(); const [profile, setProfile] = useState<Profile | null>(null); const [error, setError] = useState('');
  useEffect(() => { if (user?.kind === 'USER') void api<{ profile: Profile }>('/auth/profile').then((body) => setProfile(body.profile)).catch((caught) => setError(caught.message)); }, [user?.id]);
  if (user?.kind !== 'USER') return <Navigate to="/play" replace />;
  if (!profile) return <div className="grid min-h-[60vh] place-items-center font-display text-2xl">{error || 'Cargando perfil…'}</div>;
  const stats = profile.stats ?? { gamesPlayed: 0, gamesWon: 0, totalPoints: 0 }; const winRate = stats.gamesPlayed ? Math.round(stats.gamesWon / stats.gamesPlayed * 100) : 0;
  const game = profile.gameStats.find((item) => item.gameId === 'pokedex-distance');
  return <section className="mx-auto max-w-5xl px-5 py-10">
    <div className="card mb-6 flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left"><div className="grid h-24 w-24 place-items-center rounded-[2rem] bg-gradient-to-br from-aqua to-electric font-display text-4xl font-bold text-night">{profile.username[0]?.toUpperCase()}</div><div><span className="label">Perfil de entrenador</span><h1 className="font-display text-4xl font-bold">{profile.username}</h1><p className="font-semibold text-ink/45">Miembro desde {new Date(profile.createdAt).toLocaleDateString('es-ES')}</p></div></div>
    <div className="mb-6 grid gap-4 sm:grid-cols-3">{[[Gamepad2, 'Partidas', stats.gamesPlayed], [Trophy, 'Victorias', stats.gamesWon], [BarChart3, 'Ratio de victoria', `${winRate}%`]].map(([Icon, label, value]) => { const StatIcon = Icon as typeof Trophy; return <article className="card !p-5" key={String(label)}><StatIcon className="text-berry" /><span className="label mt-3">{String(label)}</span><strong className="font-display text-4xl">{String(value)}</strong></article>; })}</div>
    <article className="card"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-electric text-night"><Crosshair /></div><div><span className="label !mb-0">Estadísticas por juego</span><h2 className="font-display text-2xl font-bold">Pokédex Distance</h2></div></div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Partidas" value={game?.gamesPlayed ?? 0} /><Metric label="Victorias" value={game?.gamesWon ?? 0} /><Metric label="Exact hits" value={game?.metrics.exactHits ?? 0} /><Metric label="Rondas superadas" value={game?.metrics.roundsSurvived ?? 0} /></div><p className="mt-5 font-extrabold text-berry">{stats.totalPoints} puntos históricos</p></article>
  </section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl bg-ink/5 p-4"><span className="block text-xs font-black uppercase tracking-wider text-ink/40">{label}</span><strong className="font-display text-2xl">{value}</strong></div>; }
