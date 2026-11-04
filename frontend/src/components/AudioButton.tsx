import { Volume2, VolumeX } from 'lucide-react';
import { useId, useState } from 'react';
import { useAudioSettings } from '../audio';
import { Pill } from '../ui';
import { AudioSettingsDialog } from './AudioSettingsDialog';

/** Botón de la cabecera que abre los ajustes de sonido; el icono (y un texto oculto) dicen si está apagado. */
export function AudioButton() {
  const muted = useAudioSettings().muted;
  const [open, setOpen] = useState(false);
  const stateId = useId();
  return (
    <>
      <Pill size="round" icon={muted ? VolumeX : Volume2} aria-label="Ajustes de sonido" aria-describedby={stateId} aria-haspopup="dialog" onClick={() => setOpen(true)} />
      <span id={stateId} className="sr-only">{muted ? 'Sonido apagado' : 'Sonido activado'}</span>
      <AudioSettingsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
