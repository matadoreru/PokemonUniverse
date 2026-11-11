import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { authError, type AuthError } from '../auth/authErrors';
import { LegalLine } from '../components/LegalLine';
import { cx, Field, Panel, Pill, PillLink, Screen, StateBox } from '../ui';
import tone from '../styles/tones.module.css';
import shape from '../styles/shapes.module.css';

const ID = 'recuperar';

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const sentBox = useRef<HTMLDivElement>(null);
  const auth = useAuth();

  useEffect(() => { form.current?.querySelector('input')?.focus(); }, []);

  // Al cambiar el formulario por la confirmación el botón desaparece: el foco pasa a la confirmación.
  useEffect(() => { if (sent) sentBox.current?.focus(); }, [sent]);

  // Foco al error: el campo concreto o el aviso general.
  useEffect(() => {
    if (!error) return;
    if (error.field) form.current?.querySelector<HTMLInputElement>(`input[name="${error.field}"]`)?.focus();
    else errorBox.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); const data = new FormData(event.currentTarget);
    try { await auth.requestPasswordReset(String(data.get('identifier'))); setSent(true); }
    catch (caught) { setError(authError(caught)); } finally { setBusy(false); }
  }

  return (
    <Screen width="narrow" footer={<LegalLine />}>
      <Panel variant="cream" aria-labelledby={`${ID}-title`} className="w-full">
        <div className="pb-1 pt-2 sm:px-3 2xl:px-5 2xl:pb-4 2xl:pt-5">
          <div className="mb-5 2xl:mb-6">
            <h1 id={`${ID}-title`} className={cx('font-display text-26 font-extrabold sm:text-34 2xl:text-44', tone.textNavy)}>Recupera tu contraseña</h1>
            <p className={cx('mt-1 text-15 font-bold 2xl:mt-2 2xl:text-18', tone.textInk2)}>Te enviamos un enlace para elegir una nueva.</p>
          </div>
          {sent ? (
            <div ref={sentBox} tabIndex={-1} data-testid="recuperar-enviado" className={cx('flex flex-col gap-4', shape.focusBox)}>
              <StateBox kind="empty" title="Revisa tu correo" text="Si existe una cuenta, te hemos enviado un enlace a su email. Caduca en 30 minutos." onCream />
              <PillLink to="/auth" variant="yellow" block>Entrar</PillLink>
            </div>
          ) : (
            <form ref={form} className="flex flex-col gap-4" onSubmit={submit} onInput={() => error?.field && setError(null)}>
              <Field label="Email o usuario" name="identifier" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} error={error?.field === 'identifier' ? error.message : null} />
              {error && !error.field && (
                <div ref={errorBox} tabIndex={-1} className={shape.focusBox}>
                  <StateBox kind="error" title="No se pudo pedir el enlace" text={error.message} onCream />
                </div>
              )}
              <Pill type="submit" variant="yellow" block loading={busy}>Enviar enlace</Pill>
              <PillLink to="/auth" variant="cream" size="small" className="self-start">Volver a Entrar</PillLink>
            </form>
          )}
        </div>
      </Panel>
    </Screen>
  );
}
