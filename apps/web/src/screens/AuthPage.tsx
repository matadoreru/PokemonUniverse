import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type Mode = 'login' | 'register' | 'guest';

export function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'guest' ? 'guest' : 'login');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const auth = useAuth(); const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try {
      if (mode === 'login') await auth.login(String(data.get('email')), String(data.get('password')));
      if (mode === 'register') await auth.register(String(data.get('username')), String(data.get('email')), String(data.get('password')));
      if (mode === 'guest') await auth.guest(String(data.get('displayName')));
      navigate('/play');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo continuar'); } finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-lg px-5 py-12">
    <div className="card">
      <div className="mb-7 text-center"><div className="pokeball-mark mx-auto h-16 w-16 border-2 border-ink" /><h1 className="mt-4 font-display text-3xl font-bold">{mode === 'login' ? 'Qué bueno verte' : mode === 'register' ? 'Crea tu perfil' : 'Partida relámpago'}</h1><p className="mt-2 font-semibold text-ink/55">{mode === 'guest' ? 'Tu progreso será temporal, pero jugarás sin límites.' : 'Tu próxima sala está a pocos segundos.'}</p></div>
      <div className="mb-6 grid grid-cols-3 rounded-2xl bg-ink/5 p-1">
        {(['login', 'register', 'guest'] as Mode[]).map((item) => <button key={item} className={`rounded-xl px-2 py-2 text-sm font-extrabold ${mode === item ? 'bg-white shadow' : 'text-ink/45'}`} onClick={() => { setMode(item); setError(''); }}>{item === 'login' ? 'Entrar' : item === 'register' ? 'Registro' : 'Invitado'}</button>)}
      </div>
      <form className="space-y-4" onSubmit={submit}>
        {mode === 'register' && <label><span className="label">Nombre de usuario</span><input className="field" name="username" minLength={3} maxLength={24} required autoComplete="username" /></label>}
        {mode !== 'guest' && <label><span className="label">Email</span><input className="field" name="email" type="email" required autoComplete="email" /></label>}
        {mode !== 'guest' && <label><span className="label">Contraseña</span><input className="field" name="password" type="password" minLength={mode === 'register' ? 10 : 1} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />{mode === 'register' && <small className="mt-1 block font-semibold text-ink/45">Mínimo 10 caracteres.</small>}</label>}
        {mode === 'guest' && <label><span className="label">Tu nombre temporal</span><input className="field" name="displayName" minLength={2} maxLength={24} required autoFocus placeholder="Entrenador/a" /></label>}
        {error && <p role="alert" className="rounded-xl bg-berry/10 px-4 py-3 text-sm font-bold text-berry">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Preparando…' : mode === 'guest' ? 'Continuar como invitado' : mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</button>
      </form>
    </div>
  </section>;
}
