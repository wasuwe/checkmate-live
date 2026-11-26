import { expect, test } from 'vitest'
import { APP_NAME } from './appInfo'

test('app name is set', () => {
  expect(APP_NAME).toBe('CheckMate Live')
})
