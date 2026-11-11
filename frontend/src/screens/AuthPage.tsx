import { ChartColumn, ImagePlus, ListPlus, LogIn, SlidersHorizontal, TrendingUp, User, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { authRedirectTarget } from '../auth/auth-redirect';
import { useAuth } from '../auth/AuthContext';
import { authError, type AuthError, type AuthField } from '../auth/authErrors';
import { LegalLine } from '../components/LegalLine';
import { cx, Field, Icon, Panel, Pill, PillLink, Screen, StateBox, TabPanel, Tabs, type TabItem } from '../ui';
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

/** Lo que gana el invitado si se crea una cuenta: todo es exclusivo de las cuentas registradas. */
export const ACCOUNT_BENEFITS: { icon: LucideIcon; text: string }[] = [
  { icon: ImagePlus, text: 'Tu propia imagen como avatar' },
  { icon: TrendingUp, text: 'Nivel y experiencia que suben al jugar' },
  { icon: SlidersHorizontal, text: 'Tus ajustes de cada minijuego, guardados' },
  { icon: ChartColumn, text: 'Tus estadísticas en el perfil' },
  { icon: ListPlus, text: 'Tus categorías y preguntas propias' },
  { icon: Users, text: 'Amigos a los que invitar a tu sala' },
];

export function AccountBenefits({ onRegister }: { onRegister(): void }) {
  return (
    <section aria-labelledby={`${ID}-ventajas`} className={cx('flex flex-col gap-2 rounded-[var(--r-card)] border-2 border-dashed px-4 py-3', tone.borderNavy)}>
      <h2 id={`${ID}-ventajas`} className={cx('font-display text-15 font-extrabold', tone.textNavy)}>Con una cuenta gratis, además:</h2>
      <ul className="grid gap-1 sm:grid-cols-2 sm:gap-x-4">
        {ACCOUNT_BENEFITS.map(({ icon, text }) => (
          <li key={text} className={cx('flex items-center gap-2 text-13 font-bold', tone.textInk2)}>
            <Icon icon={icon} size={18} className={cx('shrink-0', tone.textBlueD)} />
            {text}
          </li>
        ))}
      </ul>
      <Pill type="button" variant="cream" size="small" icon={UserPlus} onClick={onRegister} className="self-start">Crear cuenta</Pill>
    </section>
  );
}

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
  // Tras entrar, vuelve a la ruta protegida que trajo aquí (con su `?sala=`) o a Jugar.
  const { state } = useLocation();

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
      navigate(authRedirectTarget(state), { replace: true });
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
              {mode === 'guest' && <AccountBenefits onRegister={() => changeMode('register')} />}
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
