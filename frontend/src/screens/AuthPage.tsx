import { AVATAR_PRESETS, type AvatarPresetId } from '@pokemon-universe/shared/public';
import { ImagePlus, LogIn, User, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { authError, type AuthError, type AuthField } from '../auth/authErrors';
import { Field, Panel, Pill, StateBox, TabPanel, Tabs, type TabItem } from '../ui';

type Mode = 'login' | 'register' | 'guest';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
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
  const [guestAvatar, setGuestAvatar] = useState<AvatarPresetId | undefined>();
  const [guestImage, setGuestImage] = useState<File | null>(null);
  const [guestImagePreview, setGuestImagePreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const guestImageInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => () => { if (guestImagePreview) URL.revokeObjectURL(guestImagePreview); }, [guestImagePreview]);

  // Foco inicial solo al llegar: al cambiar de pestaña el foco se queda en la lista de pestañas.
  useEffect(() => { form.current?.querySelector('input')?.focus(); }, []);

  // Foco al error: el campo concreto o el aviso general.
  useEffect(() => {
    if (!error) return;
    if (error.field) form.current?.querySelector<HTMLInputElement>(`input[name="${error.field}"]`)?.focus();
    else errorBox.current?.focus();
  }, [error]);

  function changeMode(next: Mode) {
    setMode(next); setError(null); setAvatarError('');
  }

  function selectPreset(presetId: AvatarPresetId) {
    setGuestAvatar(presetId); setGuestImage(null); setGuestImagePreview(null); setAvatarError('');
  }

  function selectGuestImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''; setAvatarError('');
    if (!file) return;
    if (!AVATAR_IMAGE_TYPES.includes(file.type)) { setAvatarError('Selecciona una imagen JPEG, PNG o WEBP.'); return; }
    if (file.size > MAX_AVATAR_BYTES) { setAvatarError('La imagen supera el límite de 5 MB.'); return; }
    setGuestAvatar(undefined); setGuestImage(file); setGuestImagePreview(URL.createObjectURL(file));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    try {
      if (mode === 'login') await auth.login(String(data.get('email')), String(data.get('password')));
      if (mode === 'register') await auth.register(String(data.get('username')), String(data.get('email')), String(data.get('password')));
      if (mode === 'guest') await auth.guest(String(data.get('displayName')), guestImage ?? guestAvatar);
      navigate('/play');
    } catch (caught) { setError(authError(caught)); } finally { setBusy(false); }
  }

  const fieldError = (field: AuthField) => (error?.field === field ? error.message : null);
  const chosen = guestImage ? 'tu imagen' : AVATAR_PRESETS.find((p) => p.id === guestAvatar)?.label;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 pb-4 pt-6 sm:px-6 lg:h-full lg:grid-rows-[minmax(0,1fr)_auto] lg:px-8 lg:pt-4">
      <Panel variant="cream" aria-labelledby={`${ID}-title`} className="w-full max-w-[520px] self-start justify-self-center lg:mt-[clamp(0px,calc((100dvh_-_720px)_/_2),12rem)]">
        <div className="pb-1 pt-2 sm:px-3">
          <div className="mb-5 flex items-center gap-3 sm:gap-4">
            <img src="/favicon.png" alt="" aria-hidden="true" className="h-12 w-12 shrink-0 sm:h-14 sm:w-14 drop-shadow-[0_3px_0_var(--navy)]" />
            <div className="min-w-0">
              <h1 id={`${ID}-title`} className="font-display text-26 font-extrabold sm:text-34 text-[color:var(--navy)]">Qué bueno verte</h1>
              <p className="mt-1 text-15 font-bold text-[color:var(--ink-2)]">{SUBTITLE[mode]}</p>
            </div>
          </div>
          <Tabs items={TABS} active={mode} onChange={changeMode} label="Método de acceso" idBase={ID} className="max-sm:!gap-1.5 max-sm:!px-1 max-sm:[&_svg]:hidden" />
          <TabPanel idBase={ID} tabKey={mode}>
            <form key={mode} ref={form} className="flex flex-col gap-4" onSubmit={submit} onInput={() => error?.field && setError(null)}>
              {mode === 'register' && <Field label="Nombre de usuario" name="username" minLength={3} maxLength={24} required autoComplete="username" error={fieldError('username')} />}
              {mode !== 'guest' && <Field label="Email" name="email" type="email" required autoComplete="email" error={fieldError('email')} />}
              {mode !== 'guest' && <Field label="Contraseña" name="password" type="password" minLength={mode === 'register' ? 10 : 1} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} error={fieldError('password')} {...(mode === 'register' ? { hint: 'Mínimo 10 caracteres.' } : {})} />}
              {mode === 'guest' && <Field label="Tu nombre temporal" name="displayName" minLength={2} maxLength={24} required placeholder="Entrenador/a" error={fieldError('displayName')} />}
              {mode === 'guest' && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 font-display text-15 font-extrabold text-[color:var(--ink)]">Elige un avatar <span className="font-body font-bold text-[color:var(--ink-2)]">(opcional)</span></legend>
                  <div className="flex flex-wrap gap-3">
                    {AVATAR_PRESETS.map((preset) => (
                      <Pill key={preset.id} size="round" variant={guestAvatar === preset.id ? 'yellow' : 'cream'} aria-pressed={guestAvatar === preset.id} aria-label={preset.label} title={preset.label} {...(guestAvatar === preset.id ? { badge: '✓' } : {})} onClick={() => selectPreset(preset.id)}>
                        <img src={preset.asset} alt="" className="block h-7 w-7 rounded-full" />
                      </Pill>
                    ))}
                    <Pill size="round" variant={guestImage ? 'yellow' : 'cream'} aria-pressed={Boolean(guestImage)} aria-label={guestImage ? 'Cambiar mi imagen' : 'Subir mi imagen'} title="Tu foto" {...(guestImage ? { badge: '✓' } : {})} {...(guestImagePreview ? {} : { icon: ImagePlus })} onClick={() => guestImageInput.current?.click()}>
                      {guestImagePreview ? <img src={guestImagePreview} alt="" className="block h-7 w-7 rounded-full object-cover" /> : undefined}
                    </Pill>
                  </div>
                  <input ref={guestImageInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={selectGuestImage} />
                  {avatarError
                    ? <p role="alert" className="text-13 font-bold text-[color:var(--red-d)]">{avatarError}</p>
                    : <p className="text-13 font-semibold text-[color:var(--ink-2)]">{chosen ? `Elegido: ${chosen}.` : 'Sin elegir: usarás la inicial de tu nombre.'} Tu foto: JPEG, PNG o WEBP, máximo 5 MB.</p>}
                </fieldset>
              )}
              {error && !error.field && (
                <div ref={errorBox} tabIndex={-1} className="rounded-[var(--r-card)] outline-offset-2 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[color:var(--navy)]">
                  <StateBox kind="error" title={FAILED[mode]} text={error.message} onCream />
                </div>
              )}
              <Pill type="submit" variant="yellow" block loading={busy}>{SUBMIT[mode]}</Pill>
            </form>
          </TabPanel>
        </div>
      </Panel>
      <p className="mx-auto max-w-[80ch] text-center text-13 font-bold text-[color:var(--sky-2)]">
        Proyecto fan no afiliado a Nintendo, Game Freak ni The Pokémon Company. Todos los nombres de productos son marcas registradas de sus respectivos dueños.
      </p>
    </div>
  );
}
