import { Show, createSignal } from 'solid-js'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/solid-router'
import { createForm } from '@tanstack/solid-form'
import { getSignupEnabled, getSessionUser, signup } from '../server/auth'
import { AuthShell } from './-/AuthShell'
import { SignupSchema } from '../types/auth-schemas'

export const Route = createFileRoute('/signup')({
  head: () => ({
    meta: [{ title: 'Create account · Ground Control' }],
  }),
  beforeLoad: async () => {
    const user = await getSessionUser()
    if (user) throw redirect({ to: '/' })
    // Signup is gated behind ENABLE_SIGNUP — bounce to login when it's off.
    const { signupEnabled } = await getSignupEnabled()
    if (!signupEnabled) throw redirect({ to: '/login' })
  },
  component: Signup,
})

function Signup() {
  const navigate = useNavigate()
  const [error, setError] = createSignal<string | null>(null)
  const [pending, setPending] = createSignal(false)

  const form = createForm(() => ({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      setError(null)
      const parsed = form.parseValuesWithSchema(SignupSchema)
      if (parsed) {
        const first = [...Object.values(parsed.form), ...Object.values(parsed.fields)]
          .flat()
          .find(Boolean)
        setError(first?.message ?? 'Check the form and try again')
        return
      }
      setPending(true)
      try {
        await signup({ data: value })
        await navigate({ to: '/' })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setPending(false)
      }
    },
  }))

  return (
    <AuthShell subtitle="Create your Ground Control account">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.Field
          name="email"
          validators={{ onChange: SignupSchema.entries.email }}
        >
          {(field) => (
            <div class="mb-4">
              <label for="email" class="mb-1.5 block text-[13px] font-medium text-stone-600">
                Email
              </label>
              <input
                id="email"
                type="email"
                autocomplete="email"
                placeholder="you@example.com"
                value={field().state.value}
                onInput={(e) => field().handleChange(e.currentTarget.value)}
                onBlur={field().handleBlur}
                class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
              />
            </div>
          )}
        </form.Field>

        <form.Field name="password" validators={{ onChange: SignupSchema.entries.password }}>
          {(field) => (
            <div class="mb-5">
              <label for="password" class="mb-1.5 block text-[13px] font-medium text-stone-600">
                Password
              </label>
              <input
                id="password"
                type="password"
                autocomplete="new-password"
                placeholder="At least 8 characters"
                value={field().state.value}
                onInput={(e) => field().handleChange(e.currentTarget.value)}
                onBlur={field().handleBlur}
                class="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
              />
            </div>
          )}
        </form.Field>

        <Show when={error()}>
          <p class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error()}
          </p>
        </Show>

        <button
          type="submit"
          disabled={pending()}
          class="w-full cursor-pointer rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-600 disabled:cursor-default disabled:opacity-60"
        >
          {pending() ? 'Creating account…' : 'Create account'}
        </button>

        <p class="mt-4 text-center text-xs text-stone-400">
          Already have an account?{' '}
          <Link
            to="/login"
            class="cursor-pointer text-stone-600 underline underline-offset-2 hover:text-stone-900"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
