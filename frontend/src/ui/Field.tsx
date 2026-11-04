import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from './cx';
import type { ForcedState } from './cx';
import { Icon } from './Icon';
import s from './Field.module.css';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  /** Referencia al `<input>` (para llevarle el foco). */
  ref?: Ref<HTMLInputElement>;
  /** Error bajo el campo; el campo recibe `aria-invalid` y `aria-describedby`. */
  error?: string | null;
  hint?: string;
  /** Etiqueta solo para lectores de pantalla. */
  hideLabel?: boolean;
  /** Código corto (sala): letra grande de display, centrada y espaciada, en mayúsculas y sin autocorrección. */
  code?: boolean;
  /** Icono decorativo a la izquierda, dentro del campo (por ejemplo, la lupa de un buscador). */
  icon?: LucideIcon;
  /** Grande: 56 px de alto y letra de 22 px (buscadores principales). */
  large?: boolean;
  className?: string;
  /** Solo galería: estado forzado. */
  forced?: ForcedState;
}

/** Envoltorio común: etiqueta, control y mensaje de error o ayuda. */
function Shell({ id, label, hideLabel, error, hint, className, children, extra }: { id: string; label: string; hideLabel?: boolean | undefined; error?: string | null | undefined; hint?: string | undefined; className?: string | undefined; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={id} className={hideLabel ? s.srOnly : s.label}>
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={s.error} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className={s.hint}>
            {hint}
          </span>
        )
      )}
      {extra}
    </div>
  );
}

function describedBy(id: string, error?: string | null, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

/** Campo de texto: crema con contorno de 3 px y texto en tinta. */
export function Field({ label, error, hint, hideLabel, code, icon, large, className, forced, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const codeProps = code ? { autoCapitalize: 'characters', autoComplete: 'off', autoCorrect: 'off', spellCheck: false } : {};
  const input = <input {...codeProps} {...rest} id={fid} className={cx(s.input, code && s.code, large && s.lg, icon && s.withIcon, error && s.invalid, forced && s[forced])} aria-invalid={error ? true : undefined} aria-describedby={describedBy(fid, error, hint)} />;
  return (
    <Shell id={fid} label={label} hideLabel={hideLabel} error={error} hint={hint} className={className}>
      {icon ? (
        <span className={s.control}>
          <Icon icon={icon} size={large ? 24 : 22} className={s.icon} />
          {input}
        </span>
      ) : (
        input
      )}
    </Shell>
  );
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
  forced?: ForcedState;
  id?: string;
}

/** Lista desplegable nativa con el aspecto del campo. */
export function SelectField({ label, value, options, onChange, hideLabel, disabled, className, forced, id }: SelectFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hideLabel={hideLabel} className={className}>
      <select id={fid} className={cx(s.input, s.select, forced && s[forced])} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

export interface TextAreaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  rows?: number;
  error?: string | null;
  hint?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  forced?: ForcedState;
  id?: string;
}

/** Área de texto con contador `n / máx` cuando hay límite. */
export function TextArea({ label, value, onChange, maxLength, rows = 4, error, hint, hideLabel, disabled, placeholder, className, forced, id }: TextAreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell
      id={fid}
      label={label}
      hideLabel={hideLabel}
      error={error}
      hint={hint}
      className={className}
      extra={
        maxLength != null && (
          <span className={cx(s.count, value.length >= maxLength && s.full)}>
            {value.length} / {maxLength}
          </span>
        )
      }
    >
      <textarea
        id={fid}
        className={cx(s.input, s.area, error && s.invalid, forced && s[forced])}
        value={value}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        onChange={(e) => onChange(maxLength != null ? e.target.value.slice(0, maxLength) : e.target.value)}
      />
    </Shell>
  );
}
