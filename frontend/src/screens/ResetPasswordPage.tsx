import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { authError, INVALID_LINK_MESSAGE, isInvalidResetLink, passwordsMatch, type AuthError, type AuthField } from '../auth/authErrors';
import { LegalLine } from '../components/LegalLine';
import { cx, Field, Panel, Pill, PillLink, Screen, StateBox } from '../ui';
import tone from '../styles/tones.module.css';
import shape from '../styles/shapes.module.css';

const ID = 'nueva-contrasena';

/** Quita `token` de la barra de direcciones para que no quede en el historial ni en capturas. */
export function removeTokenFromUrl(win: { location: Pick<Location, 'pathname' | 'search' | 'hash'>; history: Pick<History, 'state' | 'replaceState'> }) {
  const params = new URLSearchParams(win.location.search);
  if (!params.has('token')) return;
  params.delete('token');
  const query = params.toString();
  win.history.replaceState(win.history.state, '', `${win.location.pathname}${query ? `?${query}` : ''}${win.location.hash}`);
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  // El token se lee una sola vez: tras quitarlo de la URL el formulario sigue usándolo desde la ref.
  const token = useRef(params.get('token') ?? '');
  const [linkInvalid, setLinkInvalid] = useState(token.current === '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const invalidBox = useRef<HTMLDivElement>(null);
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => { removeTokenFromUrl(window); }, []);
  // Al cambiar de contenido el foco se recoloca: al campo, o al aviso si el enlace ya no vale.
  useEffect(() => {
    if (linkInvalid) invalidBox.current?.focus(); else form.current?.querySelector('input')?.focus();
  }, [linkInvalid]);

  // Foco al error: el campo concreto o el aviso general.
  useEffect(() => {
    if (!error) return;
    if (error.field) form.current?.querySelector<HTMLInputElement>(`input[name="${error.field}"]`)?.focus();
    else errorBox.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    const mismatch = passwordsMatch(password, String(data.get('passwordRepeat')));
    if (mismatch) { setError(mismatch); return; }
    setBusy(true);
    try { await auth.resetPassword(token.current, password); navigate('/play'); }
    catch (caught) {
      if (isInvalidResetLink(caught)) setLinkInvalid(true); else setError(authError(caught));
    } finally { setBusy(false); }
  }

  const fieldError = (field: AuthField) => (error?.field === field ? error.message : null);

  return (
    <Screen width="narrow" footer={<LegalLine />}>
      <Panel variant="cream" aria-labelledby={`${ID}-title`} className="w-full">
        <div className="pb-1 pt-2 sm:px-3 2xl:px-5 2xl:pb-4 2xl:pt-5">
          <div className="mb-5 2xl:mb-6">
            <h1 id={`${ID}-title`} className={cx('font-display text-26 font-extrabold sm:text-34 2xl:text-44', tone.textNavy)}>Elige tu contraseña nueva</h1>
            <p className={cx('mt-1 text-15 font-bold 2xl:mt-2 2xl:text-18', tone.textInk2)}>Al guardarla entrarás directamente.</p>
          </div>
          {linkInvalid ? (
            <div ref={invalidBox} tabIndex={-1} data-testid="enlace-no-valido" className={cx('flex flex-col gap-4', shape.focusBox)}>
              <StateBox kind="error" title="Enlace no válido" text={INVALID_LINK_MESSAGE} onCream />
              <PillLink to="/auth/recuperar" variant="yellow" block>Pedir otro enlace</PillLink>
            </div>
          ) : (
            <form ref={form} className="flex flex-col gap-4" onSubmit={submit} onInput={() => error?.field && setError(null)}>
              <Field label="Contraseña nueva" name="password" type="password" minLength={10} maxLength={128} required autoComplete="new-password" hint="Mínimo 10 caracteres." error={fieldError('password')} />
              <Field label="Repite la contraseña" name="passwordRepeat" type="password" required autoComplete="new-password" error={fieldError('passwordRepeat')} />
              {error && !error.field && (
                <div ref={errorBox} tabIndex={-1} className={shape.focusBox}>
                  <StateBox kind="error" title="No se pudo guardar la contraseña" text={error.message} onCream />
                </div>
              )}
              <Pill type="submit" variant="yellow" block loading={busy}>Guardar contraseña</Pill>
            </form>
          )}
        </div>
      </Panel>
    </Screen>
  );
}
