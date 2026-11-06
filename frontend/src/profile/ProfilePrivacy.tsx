import type { ProfileVisibility } from '@pokemon-universe/shared/public';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { ProfileSettingsResponse } from '../lib/api-contract';
import { cx, Dialog, Pill, Segmented } from '../ui';
import tone from '../styles/tones.module.css';

export const VISIBILITY_LABEL: Record<ProfileVisibility, string> = { EVERYONE: 'Todos', FRIENDS: 'Solo amigos', NOBODY: 'Nadie' };

/** Qué ven los demás con cada opción; el nombre y el avatar se ven siempre. */
export const VISIBILITY_HELP: Record<ProfileVisibility, string> = {
  EVERYONE: 'Cualquier jugador con cuenta ve tu nivel, tus estadísticas y tus logros.',
  FRIENDS: 'Solo tus amigos ven tu nivel, tus estadísticas y tus logros.',
  NOBODY: 'Nadie más ve tu nivel, tus estadísticas ni tus logros, tampoco tus amigos.',
};

const OPTIONS = (['EVERYONE', 'FRIENDS', 'NOBODY'] as const).map((value) => ({ value, label: VISIBILITY_LABEL[value] }));

/** Contenido del diálogo: se monta al abrirlo, así que cada apertura empieza sin mensaje. Cada cambio se guarda al momento. */
function PrivacyForm({ value, onSaved }: { value: ProfileVisibility; onSaved(next: ProfileVisibility): void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const change = (next: ProfileVisibility) => {
    setBusy(true);
    setMessage('');
    void api<ProfileSettingsResponse>('/auth/profile', { method: 'PATCH', body: JSON.stringify({ profileVisibility: next }) })
      .then((body) => { onSaved(body.profileVisibility); setMessage('Guardado.'); })
      .catch(() => setMessage('No se pudo guardar. Comprueba la conexión y vuelve a intentarlo.'))
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-col gap-3" aria-busy={busy}>
      <Segmented label="Perfil visible para" value={value} options={OPTIONS.map((o) => ({ ...o, disabled: busy }))} onChange={change} />
      <p className="text-15 font-bold">{VISIBILITY_HELP[value]}</p>
      <p className={cx('text-13 font-bold', tone.textInk2)}>Tu nombre y tu avatar se ven siempre, y te pueden enviar solicitudes de amistad.</p>
      {/* La única región viva del diálogo: «Guardado.» o el fallo. */}
      <p className="min-h-[1.5em] text-15 font-extrabold" role="status">{message}</p>
    </div>
  );
}

/**
 * Ajuste «Perfil visible para» del perfil propio: una línea con el valor y la píldora «Privacidad», que abre un diálogo
 * con Todos / Solo amigos / Nadie.
 */
export function ProfilePrivacy({ value, onSaved }: { value: ProfileVisibility; onSaved(next: ProfileVisibility): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className={cx('text-13 font-extrabold', tone.textSky2)}>Perfil visible para: <span className={tone.textWhite}>{VISIBILITY_LABEL[value]}</span></p>
      <Pill size="small" variant="ghost" icon={Eye} aria-haspopup="dialog" onClick={() => setOpen(true)}>Privacidad</Pill>
      <Dialog open={open} title="Perfil visible para" onClose={() => setOpen(false)} width={460} actions={[{ label: 'Cerrar', variant: 'blue', onClick: () => undefined }]}>
        {open && <PrivacyForm value={value} onSaved={onSaved} />}
      </Dialog>
    </div>
  );
}
