import { LogIn, User, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { authError, type AuthError, type AuthField } from '../auth/authErrors';
import { LegalLine } from '../components/LegalLine';
import { cx, Field, Panel, Pill, PillLink, Screen, StateBox, TabPanel, Tabs, type TabItem } from '../ui';
import tone from '../styles/tones.module.css';

type Mode = 'login' | 'register' | 'guest';
const ID = 'acceso';

const TABS: TabItem<Mode>[] = [
  { key: 'login', label: 'Entrar', icon: LogIn },
  { key: 'register', label: 'Registro', icon: UserPlus },
  { key: 'guest', label: 'Invitado', icon: User },
];
const SUBTITLE: Record<Mode, string> = {
  login: 'Tu próxima sala está a pocos segundos.',
  register: 'Crea tu perfil y guarda tus récords.',
  guest: 'Juega ya; tu progreso no se guardará.',
};
const SUBMIT: Record<Mode, string> = { login: 'Iniciar sesión', register: 'Crear cuenta', guest: 'Continuar como invitado' };
const FAILED: Record<Mode, string> = { login: 'No se pudo iniciar sesión', register: 'No se pudo crear la cuenta', guest: 'No se pudo entrar como invitado' };

function initialMode(value: string | null): Mode {
  return value === 'guest' || value === 'register' ? value : 'login';
}

export function AuthPage() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => initialMode(params.get('mode')));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const auth = useAuth();
  const navigate = useNavigate();

  // Foco inicial solo al llegar: al cambiar de pestaña el foco se queda en la lista de pestañas.
  useEffect(() => { form.current?.querySelector('input')?.focus(); }, []);

  // Foco al error: el campo concreto o el aviso general.
  useEffect(() => {
    if (!error) return;
    if (error.field) form.current?.querySelector<HTMLInputElement>(`input[name="${error.field}"]`)?.focus();
    else errorBox.current?.focus();
  }, [error]);

  function changeMode(next: Mode) {
    setMode(next); setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    try {
      if (mode === 'login') await auth.login(String(data.get('identifier')), String(data.get('password')));
      if (mode === 'register') await auth.register(String(data.get('username')), String(data.get('email')), String(data.get('password')));
      if (mode === 'guest') await auth.guest(String(data.get('displayName')));
      navigate('/play');
    } catch (caught) { setError(authError(caught)); } finally { setBusy(false); }
  }

  const fieldError = (field: AuthField) => (error?.field === field ? error.message : null);

  return (
    <Screen width="narrow" footer={<LegalLine />}>
      <Panel variant="cream" aria-labelledby={`${ID}-title`} className="w-full">
        <div className="pb-1 pt-2 sm:px-3 2xl:px-5 2xl:pb-4 2xl:pt-5">
          <div className="mb-5 flex items-center gap-3 sm:gap-4 2xl:mb-6">
            <img src="/favicon.png" alt="" aria-hidden="true" className="h-12 w-12 shrink-0 sm:h-14 sm:w-14 2xl:h-16 2xl:w-16 drop-shadow-[0_3px_0_var(--navy)]" />
            <div className="min-w-0">
              <h1 id={`${ID}-title`} className={cx('font-display text-26 font-extrabold sm:text-34 2xl:text-44', tone.textNavy)}>Qué bueno verte</h1>
              <p className={cx('mt-1 text-15 font-bold 2xl:mt-2 2xl:text-18', tone.textInk2)}>{SUBTITLE[mode]}</p>
            </div>
          </div>
          <Tabs items={TABS} active={mode} onChange={changeMode} label="Método de acceso" idBase={ID} className="max-sm:!gap-1.5 max-sm:!px-1 max-sm:[&_svg]:hidden" />
          <TabPanel idBase={ID} tabKey={mode}>
            <form key={mode} ref={form} className="flex flex-col gap-3" onSubmit={submit} onInput={() => error?.field && setError(null)}>
              {mode === 'register' && <Field label="Nombre de usuario" name="username" minLength={3} maxLength={24} required autoComplete="username" error={fieldError('username')} />}
              {mode === 'login' && <Field label="Email o usuario" name="identifier" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} error={fieldError('identifier')} />}
              {mode === 'register' && <Field label="Email" name="email" type="email" required autoComplete="email" error={fieldError('email')} />}
              {mode !== 'guest' && <Field label="Contraseña" name="password" type="password" minLength={mode === 'register' ? 10 : 1} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} error={fieldError('password')} {...(mode === 'register' ? { hint: 'Mínimo 10 caracteres.' } : {})} />}
              {mode === 'guest' && <Field label="Tu nombre temporal" name="displayName" minLength={2} maxLength={24} required placeholder="Entrenador/a" error={fieldError('displayName')} />}
              {mode === 'login' && <PillLink to="/auth/recuperar" variant="cream" size="small" className="self-start">¿Has olvidado la contraseña?</PillLink>}
              {/* Aviso compacto (sin icono en pantallas bajas): con el enlace de recuperar, el panel de 1280×720 no cabe con el aviso grande. */}
              {error && !error.field && (
                <div ref={errorBox} tabIndex={-1} className={cx('[&>div]:min-h-0 [&>div]:py-0 [@media(max-height:800px)]:[&_svg]:hidden rounded-[var(--r-card)] outline-offset-2 focus-visible:outline focus-visible:outline-[3px]', tone.focusNavy)}>
                  <StateBox kind="error" title={FAILED[mode]} text={error.message} onCream />
                </div>
              )}
              <Pill type="submit" variant="yellow" block loading={busy}>{SUBMIT[mode]}</Pill>
            </form>
          </TabPanel>
        </div>
      </Panel>
    </Screen>
  );
}
