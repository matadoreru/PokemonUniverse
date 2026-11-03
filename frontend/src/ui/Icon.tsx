import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  icon: LucideIcon;
  size?: 18 | 22 | 24 | 32;
  /** Con etiqueta el icono es una imagen accesible; sin ella es decorativo. */
  label?: string;
  className?: string | undefined;
}

/** Icono de lucide con el trazo y el color del sistema. */
export function Icon({ icon: Glyph, size = 24, label, className }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={2.5}
      color="currentColor"
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
