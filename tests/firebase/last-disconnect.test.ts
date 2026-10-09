import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

// Feasibility experiments, NOT production security rules.
const rules = {
  rules: {
    rooms: {
      $room: {
        '.read': 'auth != null',
        '.write':
          "auth != null && !newData.exists() && data.child('connections').child(auth.uid).exists() && ((auth.uid == 'alice' && !data.child('connections/bob').exists()) || (auth.uid == 'bob' && !data.child('connections/alice').exists()))",
        connections: {
          $uid: { '.write': 'auth != null && auth.uid == $uid && !newData.exists()' },
        },
      },
    },
    markers: { $uid: { '.write': 'auth != null && auth.uid == $uid' } },
  },
}
let env: RulesTestEnvironment

beforeAll(async () => {
  if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000')
    throw new Error('This experiment must run in the local Firebase emulator.')
  env = await initializeTestEnvironment({
    projectId: 'demo-eh-broadcast',
    database: { host: '127.0.0.1', port: 9000, rules: JSON.stringify(rules) },
  })
})
beforeEach(() => env.clearDatabase())
afterAll(async () => {
  await env?.cleanup()
})

async function seed(connections: Record<string, boolean>) {
  await env.withSecurityRulesDisabled(async (context) => {
    await context
      .database()
      .ref('rooms/test')
      .set({
        connections,
        messages: { sample: { text: 'keep while occupied' } },
        passwordVerifier: 'fixture-only',
      })
  })
}

async function readRoom() {
  return readAdmin('rooms/test')
}

async function readAdmin(path: string) {
  let value: any
  await env.withSecurityRulesDisabled(async (context) => {
    value = (await context.database().ref(path).get()).val()
  })
  return value
}

test('conditional whole-room deletion cannot be registered when two users are present', async () => {
  await seed({ alice: true, bob: true })
  const alice = env.authenticatedContext('alice').database()
  await assertFails(alice.ref('rooms/test').onDisconnect().remove())
  expect((await readRoom()).messages.sample.text).toBe('keep while occupied')
  alice.goOffline()
})

test('removing both presence entries leaves messages and verifier behind', async () => {
  await seed({ alice: true, bob: true })
  const alice = env.authenticatedContext('alice').database()
  const bob = env.authenticatedContext('bob').database()
  await alice.ref('rooms/test/connections/alice').onDisconnect().remove()
  await bob.ref('rooms/test/connections/bob').onDisconnect().remove()
  alice.goOffline()
  bob.goOffline()
  await expect.poll(async () => (await readRoom()).connections).toBeUndefined()
  const room = await readRoom()
  expect(room.messages.sample).toBeDefined()
  expect(room.passwordVerifier).toBe('fixture-only')
})

test('a delete registered while alone is denied later if another user has joined', async () => {
  await seed({ alice: true })
  const alice = env.authenticatedContext('alice').database()
  await alice.ref('rooms/test').onDisconnect().remove()
  await alice.ref('markers/alice').onDisconnect().set(true)
  await seed({ alice: true, bob: true })
  alice.goOffline()
  // A sentinel on a separate branch establishes that the server has processed
  // disconnect events before checking the room. The deletion is denied at execution.
  await expect.poll(() => readAdmin('markers/alice')).toBe(true)
  expect((await readRoom()).connections.bob).toBe(true)
  expect((await readRoom()).messages.sample).toBeDefined()
})
