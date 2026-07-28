import { useState, type FormEvent, type ReactNode } from 'react'
import { formatNotional, roleLabel, type User } from '@/domain'
import { Button } from '@/components/Button'
import { useAuth } from '@/app/AuthContext'
import { BRAND } from '@/theme/brand'
import { DEMO_PASSPHRASE_HINT } from '@/services'
import { cn } from '@/lib/cn'

/**
 * Sign-in for the demo identity provider.
 *
 * The users are listed on screen with their permissions visible, because the
 * point of this screen in a demo is not the login — it is showing that the same
 * workspace behaves differently for a senior trader, a junior on a small
 * mandate, and a read-only risk user.
 */
export function SignIn(): ReactNode {
  const { users, signIn } = useAuth()
  const [selected, setSelected] = useState(() => users[0]?.id ?? '')
  const [passphrase, setPassphrase] = useState('demo')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)

    void signIn(selected, passphrase)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Sign-in failed')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-4">
      <form
        onSubmit={handleSubmit}
        data-testid="sign-in"
        aria-label="Sign in"
        className="animate-rise w-full max-w-md rounded-panel border border-line bg-panel p-5 shadow-2xl shadow-black/20"
      >
        <header className="mb-4 flex items-center gap-2.5">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-md bg-brand text-[11px] font-bold text-white"
            aria-hidden="true"
          >
            {BRAND.productInitials}
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-ink">{BRAND.productName}</h1>
            <p className="text-[11px] text-ink-subtle">{BRAND.tagline}</p>
          </div>
        </header>

        <fieldset className="mb-3">
          <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            Sign in as
          </legend>
          <div className="flex flex-col gap-1.5">
            {users.map((user) => (
              <UserOption
                key={user.id}
                user={user}
                selected={selected === user.id}
                onSelect={setSelected}
              />
            ))}
          </div>
        </fieldset>

        <div className="mb-3">
          <label
            htmlFor="passphrase"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-subtle"
          >
            Passphrase
          </label>
          <input
            id="passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => {
              setPassphrase(event.target.value)
            }}
            autoComplete="off"
            data-testid="sign-in-passphrase"
            aria-describedby="passphrase-hint"
            className="h-8 w-full rounded border border-line bg-panel-raised px-2 text-xs text-ink outline-none transition-colors focus:border-brand"
          />
          <p id="passphrase-hint" className="mt-1 text-[10px] text-ink-subtle">
            {DEMO_PASSPHRASE_HINT}
          </p>
        </div>

        {error !== undefined && (
          <p className="mb-2 text-[11px] text-sell" role="alert" data-testid="sign-in-error">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          data-testid="sign-in-submit"
          className="w-full"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="mt-3 border-t border-line pt-3 text-[10px] leading-snug text-ink-subtle">
          Demonstration identity provider. A deployment authenticates against your own OIDC or SAML
          provider and enforces entitlements server-side — this screen shows the shape, not the
          security.
        </p>
      </form>
    </div>
  )
}

function UserOption({
  user,
  selected,
  onSelect,
}: {
  readonly user: User
  readonly selected: boolean
  readonly onSelect: (id: string) => void
}): ReactNode {
  const { entitlements } = user

  const permission = !entitlements.canTrade
    ? 'View only'
    : `Up to ${formatNotional(entitlements.maxNotional)} · ${
        entitlements.instruments.length === 0
          ? 'all instruments'
          : `${String(entitlements.instruments.length)} instruments`
      }`

  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
        selected ? 'border-brand bg-brand-soft' : 'border-line hover:bg-panel-hover'
      )}
    >
      <input
        type="radio"
        name="user"
        value={user.id}
        checked={selected}
        onChange={() => {
          onSelect(user.id)
        }}
        data-testid={`sign-in-user-${user.id}`}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full',
          selected ? 'bg-brand' : 'border border-line-strong'
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-ink">
          {user.name} <span className="text-ink-subtle">· {user.desk}</span>
        </span>
        <span className="block text-[10px] text-ink-muted">
          {roleLabel(user.role)} — {permission}
        </span>
      </span>
    </label>
  )
}
