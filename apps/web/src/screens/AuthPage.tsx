import { AVATAR_PRESETS, type AvatarPresetId } from '@pokemon-universe/shared';
import { LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';

type Mode = 'login' | 'register' | 'guest';

export function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'guest' ? 'guest' : 'login');
  const [guestAvatar, setGuestAvatar] = useState<AvatarPresetId | undefined>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const auth = useAuth(); const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try {
      if (mode === 'login') await auth.login(String(data.get('email')), String(data.get('password')));
      if (mode === 'register') await auth.register(String(data.get('username')), String(data.get('email')), String(data.get('password')));
      if (mode === 'guest') await auth.guest(String(data.get('displayName')), guestAvatar);
      navigate('/play');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo continuar'); } finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-lg px-4 py-8 sm:px-5 sm:py-12">
    <div className="card">
      <div className="mb-6 text-center"><div className="pokeball-mark mx-auto h-14 w-14 border border-ink" /><h1 className="mt-3 font-display text-3xl font-bold">{mode === 'login' ? 'Qué bueno verte' : mode === 'register' ? 'Crea tu perfil' : 'Partida relámpago'}</h1><p className="mt-1.5 font-semibold text-ink/65">{mode === 'guest' ? 'Tu progreso será temporal, pero jugarás sin límites.' : 'Tu próxima sala está a pocos segundos.'}</p></div>
      <div className="mb-6 grid grid-cols-3 rounded-xl bg-ink/[.07] p-1" role="tablist" aria-label="Método de acceso">
        {(['login', 'register', 'guest'] as Mode[]).map((item) => <button type="button" role="tab" aria-selected={mode === item} key={item} className={`min-h-10 rounded-lg px-2 py-2 text-sm font-extrabold transition-colors ${mode === item ? 'bg-surface text-ink shadow-card' : 'text-ink/65 hover:text-ink'}`} onClick={() => { setMode(item); setError(''); }}>{item === 'login' ? 'Entrar' : item === 'register' ? 'Registro' : 'Invitado'}</button>)}
      </div>
      <form className="space-y-4" onSubmit={submit}>
        {mode === 'register' && <label><span className="label">Nombre de usuario</span><input className="field" name="username" minLength={3} maxLength={24} required autoComplete="username" /></label>}
        {mode !== 'guest' && <label><span className="label">Email</span><input className="field" name="email" type="email" required autoComplete="email" /></label>}
        {mode !== 'guest' && <label><span className="label">Contraseña</span><input className="field" name="password" type="password" minLength={mode === 'register' ? 10 : 1} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />{mode === 'register' && <small className="mt-1 block font-semibold text-ink/65">Mínimo 10 caracteres.</small>}</label>}
        {mode === 'guest' && <label><span className="label">Tu nombre temporal</span><input className="field" name="displayName" minLength={2} maxLength={24} required autoFocus placeholder="Entrenador/a" /></label>}
        {mode === 'guest' && <fieldset><legend className="label">Elige un avatar <span className="normal-case tracking-normal text-ink/55">(opcional)</span></legend><div className="grid grid-cols-4 gap-2">{AVATAR_PRESETS.map((preset) => <button key={preset.id} type="button" aria-pressed={guestAvatar === preset.id} aria-label={preset.label} onClick={() => setGuestAvatar(preset.id)} className={`grid min-h-16 place-items-center rounded-2xl border transition ${guestAvatar === preset.id ? 'border-berry bg-berry/10' : 'border-ink/10 hover:border-aqua'}`}><Avatar name={preset.label} avatar={{ type: 'PRESET', value: preset.id }} size="md" /></button>)}</div></fieldset>}
        {error && <p role="alert" className="status-error">{error}</p>}
        <button className="btn-primary w-full" disabled={busy} aria-busy={busy}>{busy && <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />}{busy ? 'Preparando…' : mode === 'guest' ? 'Continuar como invitado' : mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</button>
      </form>
    </div>
  </section>;
}
