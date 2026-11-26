import { expect, test, vi } from 'vitest'
import { createTokenSource, type AuthLike } from './tokenSource'

const session = (token: string | null) => ({
  data: { session: token === null ? null : { access_token: token } },
})

function fakeAuth(current: string | null, refreshed: string | null): AuthLike {
  return {
    getSession: vi.fn(async () => session(current)),
    refreshSession: vi.fn(async () => session(refreshed)),
  }
}

const guestToken = () => vi.fn(async (forceNew: boolean) => (forceNew ? 'guest-new' : 'guest-old'))

test('without Supabase configured, always uses the guest token', async () => {
  const guest = guestToken()
  const getToken = createTokenSource({ auth: null, guestToken: guest })
  expect(await getToken()).toBe('guest-old')
  expect(await getToken(true)).toBe('guest-new')
})

test('a signed-in user gets the Supabase access token', async () => {
  const guest = guestToken()
  const getToken = createTokenSource({ auth: fakeAuth('jwt-1', 'jwt-2'), guestToken: guest })
  expect(await getToken()).toBe('jwt-1')
  expect(guest).not.toHaveBeenCalled()
})

test('forceNew refreshes the Supabase session', async () => {
  const auth = fakeAuth('jwt-1', 'jwt-2')
  const getToken = createTokenSource({ auth, guestToken: guestToken() })
  expect(await getToken(true)).toBe('jwt-2')
  expect(auth.refreshSession).toHaveBeenCalledOnce()
})

test('signed out with Supabase configured falls back to guest', async () => {
  const getToken = createTokenSource({ auth: fakeAuth(null, null), guestToken: guestToken() })
  expect(await getToken()).toBe('guest-old')
})

test('a session that cannot be refreshed falls back to the saved guest token', async () => {
  const guest = guestToken()
  const getToken = createTokenSource({ auth: fakeAuth('jwt-stale', null), guestToken: guest })
  expect(await getToken(true)).toBe('guest-old')
  expect(guest).toHaveBeenCalledWith(false)
})

test('falls back to guest when Supabase is unreachable', async () => {
  const auth: AuthLike = {
    getSession: vi.fn(async () => {
      throw new Error('network')
    }),
    refreshSession: vi.fn(async () => session(null)),
  }
  const getToken = createTokenSource({ auth, guestToken: guestToken() })
  expect(await getToken()).toBe('guest-old')
})
