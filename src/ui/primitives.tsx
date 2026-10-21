import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { COLORS, getColor } from '../domain/colors';

// ---------------------------------------------------------------------------
// Boutons
// ---------------------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size,
  block,
  loading,
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: 'sm' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${block ? 'btn-block' : ''} ${className}`}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={20} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  filled,
  className = '',
  size = 22,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; filled?: boolean; size?: number }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} className={`icon-btn ${filled ? 'filled' : ''} ${className}`}>
      <Icon name={icon} size={size} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chips, pastilles
// ---------------------------------------------------------------------------

export function Chip({
  pressed,
  onClick,
  children,
  role,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: 'radio' | 'checkbox';
}) {
  return (
    <button
      type="button"
      className="chip"
      role={role}
      aria-pressed={role ? undefined : pressed}
      aria-checked={role ? pressed : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ColorDot({ color, size = 16 }: { color: string; size?: number }) {
  const c = getColor(color);
  return <span className="dot" style={{ background: c.hex, width: size, height: size }} title={c.label} aria-hidden />;
}

/** Choix multiple parmi des options (chips). */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  multiple,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T[];
  onChange: (v: T[]) => void;
  multiple?: boolean;
  label: string;
}) {
  return (
    <div className="chip-wrap" role={multiple ? 'group' : 'radiogroup'} aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Chip
            key={String(o.value)}
            pressed={on}
            role={multiple ? 'checkbox' : 'radio'}
            onClick={() => onChange(multiple ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
          >
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Nuancier : sélection simple ou multiple. */
export function ColorPicker({
  value,
  onChange,
  multiple,
  label,
  exclude = [],
}: {
  value: string[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
  label: string;
  exclude?: string[];
}) {
  return (
    <div className="swatches" role={multiple ? 'group' : 'radiogroup'} aria-label={label}>
      {COLORS.filter((c) => !exclude.includes(c.key)).map((c) => {
        const on = value.includes(c.key);
        return (
          <button
            key={c.key}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={on}
            aria-label={c.label}
            title={c.label}
            className={`swatch ${multiple ? 'swatch-secondary' : ''}`}
            style={{ background: c.hex }}
            onClick={() => onChange(multiple ? (on ? value.filter((v) => v !== c.key) : [...value, c.key]) : [c.key])}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="label">{label}</span>}
      {children}
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panneau modal (bottom sheet sur mobile, panneau centré sur ordinateur)
// ---------------------------------------------------------------------------

export function Sheet({
  title,
  onClose,
  children,
  footer,
  size,
  headerExtra,
  page,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'wide' | 'narrow';
  headerExtra?: ReactNode;
  /** plein écran sur mobile, sans en-tête : le contenu fournit sa propre barre (fiche vêtement) */
  page?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [],
      );
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el?.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      el?.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`sheet ${size ?? ''} ${page ? 'page' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={page ? undefined : titleId}
        aria-label={page && typeof title === 'string' ? title : undefined}
        tabIndex={-1}
      >
        <div className="sheet-grip" aria-hidden />
        {!page && (
          <div className="sheet-head">
            <h2 id={titleId}>{title}</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              {headerExtra}
              <IconButton icon="close" label="Fermer" onClick={onClose} />
            </div>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Sheet
      title={title}
      onClose={onCancel}
      size="narrow"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} data-autofocus>
            Annuler
          </Button>
          <Button variant={danger ? 'danger' : 'secondary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Notices & états vides
// ---------------------------------------------------------------------------

export function Notice({
  tone = 'info',
  icon,
  title,
  children,
  actions,
}: {
  tone?: 'info' | 'warn' | 'error' | 'demo' | 'neutral';
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon ?? (tone === 'warn' || tone === 'error' ? 'alert' : 'info')} size={18} />
      <div className="notice-body">
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
        {actions && <div className="notice-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyArt({ kind }: { kind: 'wardrobe' | 'favorites' | 'outfit' | 'search' }) {
  const icon: Record<typeof kind, IconName> = { wardrobe: 'hanger', favorites: 'heart', outfit: 'shirt', search: 'search' };
  return (
    <span className="empty-art" aria-hidden>
      <Icon name={icon[kind]} size={28} />
    </span>
  );
}

export function EmptyState({
  art,
  title,
  children,
  actions,
}: {
  art: 'wardrobe' | 'favorites' | 'outfit' | 'search';
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      <EmptyArt kind={art} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
