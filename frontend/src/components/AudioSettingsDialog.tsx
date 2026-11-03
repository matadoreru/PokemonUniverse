import { audio, useAudioSettings } from '../audio';
import type { AudioSettings, Step } from '../audio';
import { Dialog, Pill, Segmented, Toggle } from '../ui';

type VolumeKey = 'master' | 'music' | 'sfx' | 'ui';

const GROUPS: { key: VolumeKey; label: string }[] = [
  { key: 'master', label: 'Volumen general' },
  { key: 'music', label: 'Música' },
  { key: 'sfx', label: 'Efectos' },
  { key: 'ui', label: 'Interfaz' },
];

const STEP_OPTIONS = ([0, 25, 50, 75, 100] as const).map((v) => ({ value: v, label: String(v) }));

/** Cambio de ajustes para un segmento de volumen. */
export function audioPatchFor(key: VolumeKey, step: Step): Partial<AudioSettings> {
  return { [key]: step };
}

export interface AudioSettingsPanelProps {
  settings: AudioSettings;
  onPatch(patch: Partial<AudioSettings>): void;
  onTest(): void;
}

/** Contenido del diálogo, sin estado: lo que se ve depende solo de los ajustes. */
export function AudioSettingsPanel({ settings, onPatch, onTest }: AudioSettingsPanelProps) {
  const muted = settings.muted;
  return (
    <div className="grid gap-3">
      <Toggle label="Sonido" checked={!muted} onChange={(on) => onPatch({ muted: !on })} />
      {GROUPS.map((g) => (
        <div key={g.key} className="grid gap-1">
          <span className="font-extrabold">{g.label}</span>
          <Segmented
            label={g.label}
            value={settings[g.key]}
            options={STEP_OPTIONS.map((o) => ({ ...o, disabled: muted }))}
            onChange={(v) => onPatch(audioPatchFor(g.key, v))}
          />
        </div>
      ))}
      <p className="m-0 text-sm font-bold">Atajo: M</p>
      <div>
        <Pill size="small" disabled={muted} onClick={onTest}>
          Probar sonido
        </Pill>
      </div>
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
        onTest={() => audio.play('game.hit')}
      />
    </Dialog>
  );
}
