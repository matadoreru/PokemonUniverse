import { audio, useAudioSettings } from '../audio';
import type { AudioSettings, Step } from '../audio';
import { VOLUME_STEP } from '../audio/settings';
import { Dialog, Slider, Toggle } from '../ui';

type VolumeKey = 'master' | 'music' | 'sfx' | 'ui';

const GROUPS: { key: VolumeKey; label: string }[] = [
  { key: 'master', label: 'Volumen general' },
  { key: 'music', label: 'Música' },
  { key: 'sfx', label: 'Efectos' },
  { key: 'ui', label: 'Interfaz' },
];

/** Cambio de ajustes para un deslizador de volumen. */
export function audioPatchFor(key: VolumeKey, step: Step): Partial<AudioSettings> {
  return { [key]: step };
}

export interface AudioSettingsPanelProps {
  settings: AudioSettings;
  onPatch(patch: Partial<AudioSettings>): void;
}

/** Contenido del diálogo, sin estado: lo que se ve depende solo de los ajustes. */
export function AudioSettingsPanel({ settings, onPatch }: AudioSettingsPanelProps) {
  const muted = settings.muted;
  return (
    <div className="grid gap-3">
      <Toggle label="Sonido" checked={!muted} onChange={(on) => onPatch({ muted: !on })} />
      {GROUPS.map((g) => (
        <Slider
          key={g.key}
          label={g.label}
          value={settings[g.key]}
          min={0}
          max={100}
          step={VOLUME_STEP}
          valueText={(v) => `${v} %`}
          disabled={muted}
          onChange={(v) => onPatch(audioPatchFor(g.key, v))}
        />
      ))}
      <p className="m-0 text-13 font-bold">Atajo: M</p>
    </div>
  );
}

export function AudioSettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const settings = useAudioSettings();
  // «Cerrar» no necesita hacer nada: `Dialog` se cierra (llama a `onClose`) después de ejecutar cualquier acción.
  return (
    <Dialog open={open} title="Ajustes de sonido" onClose={onClose} actions={[{ label: 'Cerrar', variant: 'ghost', onClick: () => undefined }]}>
      <AudioSettingsPanel
        settings={settings}
        onPatch={(patch) => {
          // Activar el sonido desde aquí es un clic: crea el AudioContext antes de aplicar el cambio.
          if (patch.muted === false) audio.unlock();
          audio.update(patch);
        }}
      />
    </Dialog>
  );
}
