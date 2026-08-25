import { initials } from '../lib/format'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const BUTTON_VARIANTS = {
  primary:
    'bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-lg shadow-rose-900/40 hover:from-pink-500 hover:to-rose-500',
  ghost:
    'bg-rose-900/50 text-rose-100 border border-rose-700/40 hover:bg-rose-900',
  quiet: 'text-rose-300 hover:text-white hover:bg-rose-900/40',
  danger: 'bg-rose-950/60 text-rose-300 border border-rose-700/50 hover:bg-rose-900/60',
} as const

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-medium',
        'transition-all duration-200 active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

const FIELD_BASE =
  'w-full rounded-2xl bg-rose-950/50 border border-rose-700/40 px-4 py-3 text-rose-100 ' +
  'placeholder:text-rose-400/50 transition-colors ' +
  'focus:border-pink-500 focus:outline-none'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(FIELD_BASE, className)} />
}

/** Password field with a reveal toggle — typing a password blind on a phone
 *  keyboard is how people end up locked out of their own app. */
export function PasswordInput({
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={cx(FIELD_BASE, 'pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center text-rose-400 transition-colors hover:text-rose-200"
      >
        {visible ? (
          // eye with a slash through it
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.4A9.5 9.5 0 0112 5c5 0 9 4.5 9 7 0 .9-.6 2.1-1.6 3.3M6.2 6.7C4.2 8.1 3 10 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"
              stroke="currentColor"
              strokeWidth="1.7"
            />
            <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        )}
      </button>
    </div>
  )
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cx(FIELD_BASE, 'min-h-32 resize-y leading-relaxed', className)}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="label block">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                    */
/* -------------------------------------------------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx(
        'inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70',
        className,
      )}
    />
  )
}

export function Loading({ label = 'One second…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-ink-faint">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="rounded-xl border border-flame/30 bg-flame/10 px-4 py-3 text-sm text-flame">
      {children}
    </p>
  )
}

/**
 * A blank page in a scrapbook, not an error. On a fresh account these are the
 * only thing a new couple sees, so they carry the pitch: what this page becomes
 * once you use it, in the app's own handwriting.
 */
export function EmptyState({
  emoji,
  title,
  children,
  example,
  action,
}: {
  emoji: string
  title: string
  children?: ReactNode
  /** Shown as a handwritten sample of what would live here. */
  example?: string
  action?: ReactNode
}) {
  return (
    <div className="animate-rise mx-auto flex max-w-lg flex-col items-center gap-3 rounded-3xl border border-rose-700/40 bg-rose-900/30 px-7 py-12 text-center shadow-xl">
      <span className="animate-float text-5xl">{emoji}</span>
      <h3 className="text-xl font-bold text-white">{title}</h3>
      {children && <p className="max-w-sm text-xs leading-relaxed text-rose-300">{children}</p>}
      {example && <p className="mt-1 max-w-sm text-sm text-pink-300 italic">“{example}”</p>}
      {action && <div className="pt-3">{action}</div>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="animate-rise mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1">
        {eyebrow && <p className="label">{eyebrow}</p>}
        <h1 className="text-lg font-bold text-white">{title}</h1>
        {children && <p className="max-w-xl text-xs text-rose-300">{children}</p>}
      </div>
      {action}
    </header>
  )
}

export function Chip({
  children,
  active = false,
  accent,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  accent?: string
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      onClick={onClick}
      style={active && accent ? { backgroundColor: `${accent}26`, color: accent } : undefined}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? accent
            ? 'ring-1 ring-current/30'
            : 'bg-lav-400/15 text-lav-300 ring-1 ring-lav-400/30'
          : 'bg-raised/50 text-ink-muted hover:text-ink-soft',
      )}
    >
      {children}
    </Tag>
  )
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

/** Lives here rather than in AppShell so it survives shell redesigns — several
 *  screens need it and none of them care how the navigation looks. */
export function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string | null | undefined
  url?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const dims = { sm: 'size-7 text-[0.6rem]', md: 'size-9 text-xs', lg: 'size-14 text-base' }[size]

  if (url) {
    return <img src={url} alt={name ?? ''} className={cx(dims, 'rounded-full object-cover')} />
  }

  return (
    <span
      aria-hidden
      className={cx(
        dims,
        'grid shrink-0 place-items-center rounded-full bg-lav-400/15 font-semibold text-lav-300',
      )}
    >
      {initials(name)}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

const ModalCtx = createContext<() => void>(() => {})
export const useCloseModal = () => useContext(ModalCtx)

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="animate-rise max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl rounded-b-none border border-rose-700/60 bg-rose-950 p-6 shadow-2xl sm:rounded-b-3xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 rounded-full p-2 text-rose-400 transition-colors hover:bg-rose-900/60 hover:text-white"
          >
            ✕
          </button>
        </div>
        <ModalCtx.Provider value={onClose}>{children}</ModalCtx.Provider>
      </div>
    </div>
  )
}
