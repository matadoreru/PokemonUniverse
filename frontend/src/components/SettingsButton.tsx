import { SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import { useAudioSettings } from '../audio';
import { Pill } from '../ui';
import { SettingsDialog } from './SettingsDialog';

/** Botón de la cabecera que abre los ajustes (sonido, movimiento y texto); un texto oculto dice si el sonido está apagado. */
export function SettingsButton() {
  const muted = useAudioSettings().muted;
  const [open, setOpen] = useState(false);
  const stateId = useId();
  return (
    <>
      <Pill size="round" icon={SlidersHorizontal} aria-label="Ajustes" aria-describedby={stateId} aria-haspopup="dialog" onClick={() => setOpen(true)} />
      <span id={stateId} className="sr-only">{muted ? 'Sonido apagado' : 'Sonido activado'}</span>
      <SettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
