import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

let env: RulesTestEnvironment
const account = (uid: string) =>
  env.authenticatedContext(uid, {
    email: `${uid}@example.invalid`,
    firebase: { sign_in_provider: 'password' },
  })
const id = 'room-00000000-0000-0000-0001'
const code = '001234'
const name = '주일 예배 방송실'
const proof = 'b'.repeat(64)
const salt = 'a'.repeat(32)
const timestamp = { '.sv': 'timestamp' }
const create = {
  [`rooms/${id}`]: {
    meta: { owner: 'owner', code, name, createdAt: timestamp, salt, verifier: proof },
    members: { owner: { role: 'broadcast', proof } },
  },
  [`directory/${code}`]: { id, code, name, createdAt: timestamp, salt },
}
const close = { [`rooms/${id}`]: null, [`directory/${code}`]: null }
function admission(uid: string, role: string, connectionId = `${uid}-connection-0001`) {
  return {
    [`rooms/${id}/connections/${uid}/${connectionId}`]: { role },
    [`rooms/${id}/seats/${role}`]: { uid, connectionId },
    [`rooms/${id}/events/${connectionId}/joined`]: { uid, role, sentAt: timestamp, type: 'joined' },
  }
}
function departure(
  uid: string,
  role: string,
  connectionId = `${uid}-connection-0001`,
  type = 'left',
) {
  return {
    [`rooms/${id}/connections/${uid}/${connectionId}`]: null,
    [`rooms/${id}/events/${connectionId}/left`]: { uid, role, sentAt: timestamp, type },
  }
}
beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Local emulator required')
  env = await initializeTestEnvironment({
    projectId: 'demo-eh-broadcast-security',
    database: {
      host: '127.0.0.1',
      port: 9000,
      rules: await readFile('firebase/database.rules.json', 'utf8'),
    },
  })
})
beforeEach(async () => {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled(async (context) => {
    const profiles = Object.fromEntries(
      [
        'owner',
        'outsider',
        'leader',
        'attacker',
        'returning-broadcast',
        'leader-a',
        'leader-b',
        'other-broadcast',
        'next',
        'late-leader',
      ].map((uid) => [
        uid,
        {
          role: ['owner', 'returning-broadcast', 'other-broadcast', 'next'].includes(uid)
            ? 'broadcast'
            : 'leader',
          createdAt: timestamp,
          email: `${uid}@example.invalid`,
        },
      ]),
    )
    await context.database().ref('profiles').set(profiles)
    await context
      .database()
      .ref('access')
      .set(
        Object.fromEntries(
          Object.keys(profiles).map((uid) => [
            uid,
            { status: 'approved', reviewedBy: 'admin', reviewedAt: timestamp },
          ]),
        ),
      )
    await context.database().ref('administrators/admin').set(true)
  })
  await account('owner').database().ref().update(create)
  await account('owner').database().ref().update(admission('owner', 'broadcast'))
})
afterAll(async () => {
  await env?.cleanup()
})

test('presets are private per account and restricted to approved account roles, including admins', async () => {
  const value = { revision: 1, items: [{ id: 'hello', text: '조정했어요' }] }
  const owner = account('owner').database()
  await assertSucceeds(owner.ref('presets/owner/broadcast').set(value))
  await assertSucceeds(owner.ref('presets/owner/broadcast').get())
  await assertFails(account('other-broadcast').database().ref('presets/owner/broadcast').get())
  await assertFails(
    account('other-broadcast')
      .database()
      .ref('presets/owner/broadcast')
      .set({ ...value, revision: 2 }),
  )
  await assertFails(owner.ref('presets/owner/leader').set(value))
  await assertFails(owner.ref('presets/owner/leader').get())
  await assertFails(owner.ref('presets/owner').get())
  await assertFails(env.unauthenticatedContext().database().ref('presets/owner/broadcast').get())
  await assertFails(
    env
      .authenticatedContext('owner', { firebase: { sign_in_provider: 'anonymous' } })
      .database()
      .ref('presets/owner/broadcast')
      .get(),
  )
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('access/admin').set({ status: 'approved' })
  })
  const admin = account('admin').database()
  await assertSucceeds(admin.ref('presets/admin/broadcast').set(value))
  await assertSucceeds(admin.ref('presets/admin/leader').set(value))
  await assertFails(admin.ref('presets/owner/broadcast').get())
  await assertFails(admin.ref('presets/owner/broadcast').set({ ...value, revision: 2 }))
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('access/owner').remove()
  })
  await assertFails(owner.ref('presets/owner/broadcast').get())
  await assertFails(owner.ref('presets/owner/broadcast').set({ ...value, revision: 2 }))
})

test('preset revisions protect concurrent saves and preserve deliberately empty lists', async () => {
  const presets = account('owner').database().ref('presets/owner/broadcast')
  await assertSucceeds(presets.set({ revision: 1, items: [{ id: 'first', text: '첫 문구' }] }))
  await assertSucceeds(
    presets.set({ revision: 2, items: [{ id: 'next', text: '다른 기기에서 저장' }] }),
  )
  await assertFails(presets.set({ revision: 2, items: [{ id: 'stale', text: '오래된 수정' }] }))
  await assertFails(presets.child('items/0/text').set('버전 변경 없는 수정'))
  await assertSucceeds(presets.set({ revision: 3, items: [] }))
  expect((await presets.get()).val()).toEqual({ revision: 3 })
  await assertFails(presets.remove())
})

test('preset storage rejects excessive or malformed data and accepts multiline text', async () => {
  const presets = account('owner').database().ref('presets/owner/broadcast')
  for (const items of [
    'invalid scalar',
    [{ id: 'empty', text: '   ' }],
    [{ id: 'long', text: 'a'.repeat(121) }],
    [{ id: 'a'.repeat(65), text: '문구' }],
    [{ id: 'extra', text: '문구', unwanted: 'data' }],
    Array.from({ length: 31 }, (_, index) => ({ id: `item-${index}`, text: '문구' })),
    { arbitrary: { id: 'key', text: '문구' } },
  ])
    await assertFails(presets.set({ revision: 1, items }))
  await assertFails(presets.set({ revision: 1, unwanted: 'data' }))
  await assertSucceeds(
    presets.set({ revision: 1, items: [{ id: 'lines', text: '첫 줄\n둘째 줄' }] }),
  )
  await assertSucceeds(
    presets.set({
      revision: 2,
      items: Array.from({ length: 30 }, (_, index) => ({
        id: `item-${index}`,
        text: 'a'.repeat(120),
      })),
    }),
  )
})

test('an account can set its role once and cannot read or replace another profile', async () => {
  const newcomer = account('new-account').database()
  await assertFails(newcomer.ref('directory').get())
  await assertSucceeds(
    newcomer
      .ref('profiles/new-account')
      .set({ role: 'leader', email: 'new-account@example.invalid', createdAt: timestamp }),
  )
  await assertFails(newcomer.ref('directory').get())
  await assertSucceeds(
    account('admin')
      .database()
      .ref('access/new-account')
      .set({ status: 'approved', reviewedBy: 'admin', reviewedAt: timestamp }),
  )
  await assertSucceeds(newcomer.ref('directory').get())
  await assertFails(newcomer.ref('profiles/new-account/role').set('broadcast'))
  await assertFails(newcomer.ref('profiles/new-account').remove())
  await assertFails(newcomer.ref('profiles/owner').get())
  await assertFails(newcomer.ref('profiles/owner').set({ role: 'leader', createdAt: timestamp }))
  await assertFails(
    newcomer.ref(`rooms/${id}/members/new-account`).set({ role: 'broadcast', proof }),
  )
  await assertSucceeds(
    newcomer.ref(`rooms/${id}/members/new-account`).set({ role: 'leader', proof }),
  )
})

test('a leader cannot create a room by forging broadcast membership', async () => {
  const leader = account('leader').database()
  const other = 'room-00000000-0000-0000-9999'
  await assertFails(
    leader.ref().update({
      [`rooms/${other}`]: {
        meta: {
          owner: 'leader',
          code: '999999',
          name,
          createdAt: timestamp,
          salt,
          verifier: proof,
        },
        members: { leader: { role: 'broadcast', proof } },
      },
      'directory/999999': { id: other, code: '999999', name, createdAt: timestamp, salt },
    }),
  )
})

test.each([null, 'broadcast', 'leader'])(
  'an administrator with profile role %s can use either room role but cannot bypass passwords, seats or ownership',
  async (profileRole) => {
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('access/admin').set({ status: 'approved' })
      if (profileRole)
        await context.database().ref('profiles/admin').set({
          role: profileRole,
          email: 'admin@example.invalid',
          createdAt: 100,
        })
    })
    const admin = account('admin').database()
    await assertSucceeds(admin.ref('directory').get())
    await assertFails(admin.ref(`rooms/${id}`).get())
    await assertFails(
      admin.ref(`rooms/${id}/members/admin`).set({ role: 'leader', proof: 'c'.repeat(64) }),
    )
    await assertFails(admin.ref(`rooms/${id}/members/admin`).set({ role: 'administrator', proof }))
    await assertSucceeds(admin.ref(`rooms/${id}/members/admin`).set({ role: 'broadcast', proof }))
    await assertFails(admin.ref().update(admission('admin', 'broadcast')))
    await assertSucceeds(admin.ref(`rooms/${id}/members/admin`).set({ role: 'leader', proof }))
    await assertSucceeds(admin.ref().update(admission('admin', 'leader')))
    await assertFails(admin.ref(`rooms/${id}/members/admin`).set({ role: 'broadcast', proof }))
    await assertFails(admin.ref().update(admission('admin', 'leader', 'admin-other-tab-0001')))
    const message = {
      id: 'admin-message-0001',
      uid: 'admin',
      role: 'leader',
      text: 'administrator as leader',
      sentAt: timestamp,
      connectionId: 'admin-connection-0001',
    }
    await assertFails(
      admin.ref(`rooms/${id}/messages/${message.id}`).set({ ...message, role: 'broadcast' }),
    )
    await assertSucceeds(admin.ref(`rooms/${id}/messages/${message.id}`).set(message))
    await assertSucceeds(admin.ref().update(departure('admin', 'leader')))
    await account('owner').database().ref().update(departure('owner', 'broadcast'))
    await assertSucceeds(admin.ref(`rooms/${id}/members/admin`).set({ role: 'broadcast', proof }))
    await assertSucceeds(
      admin.ref().update(admission('admin', 'broadcast', 'admin-connection-0002')),
    )
    await assertSucceeds(
      admin.ref(`rooms/${id}/messages/admin-message-0002`).set({
        ...message,
        id: 'admin-message-0002',
        role: 'broadcast',
        connectionId: 'admin-connection-0002',
      }),
    )
    await assertFails(admin.ref().update(close))
    await assertSucceeds(
      admin.ref().update(departure('admin', 'broadcast', 'admin-connection-0002')),
    )
    expect((await admin.ref('profiles/admin').get()).val()).toEqual(
      profileRole ? { role: profileRole, email: 'admin@example.invalid', createdAt: 100 } : null,
    )
  },
)

test.each([null, 'leader'])(
  'an administrator with profile role %s creates as broadcast and closes their own room',
  async (profileRole) => {
    await account('owner').database().ref().update(close)
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('access/admin').set({ status: 'approved' })
      if (profileRole) await context.database().ref('profiles/admin').set({ role: profileRole })
    })
    const admin = account('admin').database()
    await assertSucceeds(
      admin.ref().update({
        ...create,
        [`rooms/${id}`]: {
          ...create[`rooms/${id}`],
          meta: { ...create[`rooms/${id}`].meta, owner: 'admin' },
          members: { admin: { role: 'broadcast', proof } },
        },
      }),
    )
    await assertSucceeds(admin.ref().update(admission('admin', 'broadcast')))
    await assertSucceeds(
      admin
        .ref()
        .onDisconnect()
        .update(departure('admin', 'broadcast', undefined, 'disconnected')),
    )
    await assertSucceeds(admin.ref().onDisconnect().cancel())
    await assertSucceeds(admin.ref().update(close))
    expect((await admin.ref(`rooms/${id}`).get()).val()).toBeNull()
  },
)

test('removing administrator permission restores fixed-role restrictions and still allows connection cleanup', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('access/admin').set({ status: 'approved' })
    await context.database().ref('profiles/admin').set({ role: 'broadcast' })
  })
  const admin = account('admin').database()
  await admin.ref(`rooms/${id}/members/admin`).set({ role: 'leader', proof })
  await admin.ref().update(admission('admin', 'leader'))
  await env.withSecurityRulesDisabled((context) =>
    context.database().ref('administrators/admin').remove(),
  )
  await assertFails(
    admin.ref(`rooms/${id}/messages/admin-revoked-0001`).set({
      id: 'admin-revoked-0001',
      uid: 'admin',
      role: 'leader',
      text: 'blocked',
      sentAt: timestamp,
      connectionId: 'admin-connection-0001',
    }),
  )
  await assertFails(admin.ref(`rooms/${id}/members/admin`).set({ role: 'leader', proof }))
  await assertSucceeds(admin.ref().update(departure('admin', 'leader')))
  await assertFails(admin.ref().update(admission('admin', 'leader', 'admin-connection-0002')))
})

test('room names are required, bounded, and identical in the directory', async () => {
  const owner = account('owner').database()
  const other = 'room-00000000-0000-0000-8888'
  for (const [roomName, listedName] of [
    ['', ''],
    ['x'.repeat(41), 'x'.repeat(41)],
    ['Sunday', 'different'],
  ]) {
    await assertFails(
      owner.ref().update({
        [`rooms/${other}`]: {
          meta: {
            owner: 'owner',
            code: '888888',
            name: roomName,
            createdAt: timestamp,
            salt,
            verifier: proof,
          },
          members: { owner: { role: 'broadcast', proof } },
        },
        'directory/888888': {
          id: other,
          code: '888888',
          name: listedName,
          createdAt: timestamp,
          salt,
        },
      }),
    )
  }
})

test('anonymous sessions cannot list, join, create or write; legacy disconnect cleanup remains allowed', async () => {
  const outsider = env
    .authenticatedContext('anonymous-outsider', { firebase: { sign_in_provider: 'anonymous' } })
    .database()
  await assertFails(outsider.ref('directory').get())
  await assertFails(outsider.ref(`rooms/${id}`).get())
  await assertFails(
    outsider.ref(`rooms/${id}/members/anonymous-outsider`).set({ role: 'leader', proof }),
  )
  const legacy = env
    .authenticatedContext('owner', { firebase: { sign_in_provider: 'anonymous' } })
    .database()
  // Old sessions may clean up their connection but cannot keep reading conversations.
  await assertFails(legacy.ref(`rooms/${id}`).get())
  await assertFails(
    legacy.ref(`rooms/${id}/messages/legacy-message`).set({
      id: 'legacy-message',
      uid: 'owner',
      role: 'broadcast',
      text: 'blocked',
      sentAt: timestamp,
      connectionId: 'owner-connection-0001',
    }),
  )
  await assertFails(legacy.ref().update(close))
  await assertSucceeds(
    legacy
      .ref()
      .onDisconnect()
      .update(departure('owner', 'broadcast', undefined, 'disconnected')),
  )
  legacy.goOffline()
  await expect
    .poll(async () => {
      let connections: unknown
      await env.withSecurityRulesDisabled(async (context) => {
        connections = (await context.database().ref(`rooms/${id}/connections`).get()).val()
      })
      return connections
    })
    .toBeNull()
  await env.clearDatabase()
  await assertFails(outsider.ref().update(create))
})

test('listing has no verifier and outsiders cannot read chat or join with a wrong password proof', async () => {
  const outsider = account('outsider').database()
  const list = (await outsider.ref('directory').get()).val()
  expect(list[code]).toMatchObject({ code, id, salt })
  expect(JSON.stringify(list)).not.toContain(proof)
  await assertFails(outsider.ref(`rooms/${id}`).get())
  await assertFails(
    outsider.ref(`rooms/${id}/members/outsider`).set({ role: 'leader', proof: 'c'.repeat(64) }),
  )
  await assertFails(env.unauthenticatedContext().database().ref('directory').get())
})

test('correct password admits a leader; identities, messages and metadata cannot be forged', async () => {
  const leader = account('leader').database()
  await assertSucceeds(leader.ref(`rooms/${id}/members/leader`).set({ role: 'leader', proof }))
  await assertSucceeds(leader.ref(`rooms/${id}`).get())
  await assertSucceeds(leader.ref().update(admission('leader', 'leader')))
  const message = {
    id: 'message-0001',
    uid: 'leader',
    role: 'leader',
    text: '모니터 소리가 작아요',
    sentAt: timestamp,
    connectionId: 'leader-connection-0001',
  }
  await assertSucceeds(leader.ref(`rooms/${id}/messages/message-0001`).set(message))
  await assertFails(
    leader
      .ref(`rooms/${id}/messages/message-0002`)
      .set({ ...message, id: 'message-0002', role: 'broadcast' }),
  )
  await assertFails(leader.ref(`rooms/${id}/meta/verifier`).set('d'.repeat(64)))
  await assertFails(leader.ref(`rooms/${id}/messages/message-0001`).remove())
  await assertFails(leader.ref().update(close))
})

test('closing requires a complete atomic deletion; late messages cannot recreate the room', async () => {
  const owner = account('owner').database()
  await assertFails(owner.ref(`rooms/${id}`).remove())
  await assertFails(owner.ref(`directory/${code}`).remove())
  await assertSucceeds(owner.ref().update(close))
  expect((await owner.ref('directory').get()).val()).toBeNull()
  expect((await owner.ref(`rooms/${id}`).get()).val()).toBeNull()
  await assertFails(
    owner.ref(`rooms/${id}/messages/message-late`).set({
      id: 'message-late',
      uid: 'owner',
      role: 'broadcast',
      text: 'late',
      sentAt: timestamp,
    }),
  )
  await assertFails(owner.ref(`rooms/${id}/members/owner`).set({ role: 'broadcast', proof }))
})

test('member and connection injection cannot bypass password admission', async () => {
  const attacker = account('attacker').database()
  await assertFails(attacker.ref(`rooms/${id}/members/owner/role`).set('leader'))
  await assertFails(
    attacker.ref(`rooms/${id}/connections/conn`).set({ uid: 'attacker', role: 'broadcast' }),
  )
  await assertFails(
    attacker.ref(`rooms/${id}`).update({
      'members/attacker': { role: 'broadcast', proof: 'wrong' },
      'meta/verifier': 'wrong',
    }),
  )
})

test('a room cannot be created without a corresponding public directory entry', async () => {
  const owner = account('owner').database()
  const nextId = 'room-00000000-0000-0000-0002'
  await assertFails(owner.ref(`rooms/${nextId}`).set(create[`rooms/${id}`]))
})

test('another broadcast cannot close a retained room; its creator can reenter and close it', async () => {
  await account('owner').database().ref().update(departure('owner', 'broadcast'))
  const returningBroadcast = account('returning-broadcast').database()
  await assertSucceeds(
    returningBroadcast
      .ref(`rooms/${id}/members/returning-broadcast`)
      .set({ role: 'broadcast', proof }),
  )
  await assertSucceeds(
    returningBroadcast.ref().update(admission('returning-broadcast', 'broadcast')),
  )
  await assertFails(returningBroadcast.ref().update(close))
  await returningBroadcast.ref().update(departure('returning-broadcast', 'broadcast'))
  const owner = account('owner').database()
  await assertSucceeds(owner.ref().update(admission('owner', 'broadcast', 'owner-returning-0002')))
  await assertSucceeds(owner.ref().update(close))
  expect((await returningBroadcast.ref(`rooms/${id}`).get()).val()).toBeNull()
})

test('disconnect removes only presence and preserves a room without any remaining connections', async () => {
  const owner = account('owner').database()
  await assertSucceeds(
    owner
      .ref()
      .onDisconnect()
      .update(departure('owner', 'broadcast', undefined, 'disconnected')),
  )
  owner.goOffline()
  let remaining: unknown
  await expect
    .poll(async () => {
      await env.withSecurityRulesDisabled(async (context) => {
        remaining = (await context.database().ref(`rooms/${id}/connections`).get()).val()
      })
      return remaining
    })
    .toBeNull()
  await env.withSecurityRulesDisabled(async (context) => {
    const room = (await context.database().ref(`rooms/${id}`).get()).val()
    expect(room.meta.verifier).toBe(proof)
    expect(room.members.owner).toBeDefined()
    expect(room.events['owner-connection-0001'].left.type).toBe('disconnected')
    expect((await context.database().ref(`directory/${code}`).get()).exists()).toBe(true)
  })
})

test('simultaneous admissions to a role allow exactly one connection, including duplicate tabs', async () => {
  const first = account('leader-a').database()
  const second = account('leader-b').database()
  await first.ref(`rooms/${id}/members/leader-a`).set({ role: 'leader', proof })
  await second.ref(`rooms/${id}/members/leader-b`).set({ role: 'leader', proof })
  const result = await Promise.allSettled([
    first.ref().update(admission('leader-a', 'leader')),
    second.ref().update(admission('leader-b', 'leader')),
  ])
  expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
  const room = (await first.ref(`rooms/${id}`).get()).val()
  const winner = room.seats.leader.uid as string
  const db = winner === 'leader-a' ? first : second
  await assertFails(db.ref().update(admission(winner, 'leader', 'another-tab-0001')))
  const loser = winner === 'leader-a' ? 'leader-b' : 'leader-a'
  expect(room.connections[loser]).toBeUndefined()
})

test('occupied broadcast role cannot be acquired or used to close the room by another member', async () => {
  const other = account('other-broadcast').database()
  await other.ref(`rooms/${id}/members/other-broadcast`).set({ role: 'broadcast', proof })
  await assertFails(other.ref().update(admission('other-broadcast', 'broadcast')))
  await assertFails(other.ref().update(close))
  await assertFails(other.ref(`rooms/${id}/connections/owner/owner-connection-0001`).remove())
  await assertFails(
    other.ref(`rooms/${id}/events/owner-connection-0001/left`).set({
      uid: 'other-broadcast',
      role: 'broadcast',
      sentAt: timestamp,
      type: 'left',
    }),
  )
})

test('a released seat is reusable; a former connection cannot send or release the new occupant', async () => {
  const owner = account('owner').database()
  await owner.ref().update(departure('owner', 'broadcast'))
  const next = account('next').database()
  await next.ref(`rooms/${id}/members/next`).set({ role: 'broadcast', proof })
  await assertSucceeds(next.ref().update(admission('next', 'broadcast')))
  await assertFails(
    owner.ref(`rooms/${id}/messages/message-old-0001`).set({
      id: 'message-old-0001',
      uid: 'owner',
      role: 'broadcast',
      text: 'old session',
      sentAt: timestamp,
      connectionId: 'owner-connection-0001',
    }),
  )
  await assertSucceeds(owner.ref(`rooms/${id}/connections/owner/owner-connection-0001`).remove())
  expect((await next.ref(`rooms/${id}/connections/next`).get()).exists()).toBe(true)
  await assertFails(next.ref(`rooms/${id}/members/next`).set({ role: 'leader', proof }))
})

test('disconnect can be registered before admission and releases the seat after admission', async () => {
  const leader = account('leader').database()
  await leader.ref(`rooms/${id}/members/leader`).set({ role: 'leader', proof })
  await assertSucceeds(
    leader
      .ref()
      .onDisconnect()
      .update(departure('leader', 'leader', undefined, 'disconnected')),
  )
  await assertSucceeds(leader.ref().update(admission('leader', 'leader')))
  leader.goOffline()
  await expect
    .poll(async () => {
      let left
      await env.withSecurityRulesDisabled(async (context) => {
        left = (
          await context.database().ref(`rooms/${id}/events/leader-connection-0001/left`).get()
        ).val()
      })
      return left
    })
    .toMatchObject({ type: 'disconnected', role: 'leader' })
})

test('a delayed admission cannot resurrect a connection after its disconnect already ran', async () => {
  const leader = account('late-leader').database()
  await leader.ref(`rooms/${id}/members/late-leader`).set({ role: 'leader', proof })
  await leader.ref().update(departure('late-leader', 'leader', undefined, 'disconnected'))
  await assertFails(leader.ref().update(admission('late-leader', 'leader')))
  expect((await leader.ref(`rooms/${id}/connections/late-leader`).get()).val()).toBeNull()
  await assertSucceeds(
    leader.ref().update(admission('late-leader', 'leader', 'new-connection-0002')),
  )
})

test('pending and rejected accounts cannot use rooms or approve themselves, even with a valid password', async () => {
  const db = account('applicant').database()
  await assertFails(
    db
      .ref('profiles/applicant')
      .set({ role: 'leader', email: 'owner@example.invalid', createdAt: timestamp }),
  )
  await assertSucceeds(
    db
      .ref('profiles/applicant')
      .set({ role: 'leader', email: 'applicant@example.invalid', createdAt: timestamp }),
  )
  await assertSucceeds(db.ref('profiles/applicant').get())
  await assertSucceeds(db.ref('access/applicant').get())
  await assertFails(db.ref('profiles').get())
  await assertFails(db.ref('access').get())
  await assertFails(db.ref('administrators').get())
  await assertFails(db.ref('administrators/applicant').set(true))
  await assertFails(
    db
      .ref('access/applicant')
      .set({ status: 'approved', reviewedAt: timestamp, reviewedBy: 'applicant' }),
  )
  await assertFails(
    db.ref().update({
      'administrators/applicant': true,
      'access/applicant': { status: 'approved', reviewedAt: timestamp, reviewedBy: 'applicant' },
    }),
  )
  for (const status of ['pending', 'rejected']) {
    if (status === 'rejected')
      await account('admin')
        .database()
        .ref('access/applicant')
        .set({ status, reviewedAt: timestamp, reviewedBy: 'admin' })
    await assertFails(db.ref('directory').get())
    await assertFails(db.ref(`rooms/${id}`).get())
    await assertFails(db.ref(`rooms/${id}/members/applicant`).set({ role: 'leader', proof }))
    await assertFails(db.ref().update(admission('applicant', 'leader')))
  }
  await assertSucceeds(account('admin').database().ref('profiles').get())
  await assertSucceeds(account('admin').database().ref('access').get())
  await assertFails(
    account('admin')
      .database()
      .ref('access/applicant')
      .set({ status: 'approved', reviewedAt: timestamp, reviewedBy: 'forged-admin' }),
  )
  await assertFails(
    account('admin')
      .database()
      .ref('access/applicant')
      .set({ status: 'approved', reviewedAt: 1, reviewedBy: 'admin' }),
  )
  await assertFails(
    account('admin')
      .database()
      .ref('access/missing-user')
      .set({ status: 'approved', reviewedAt: timestamp, reviewedBy: 'admin' }),
  )
  await assertSucceeds(
    account('admin')
      .database()
      .ref('access/applicant')
      .set({ status: 'approved', reviewedAt: timestamp, reviewedBy: 'admin' }),
  )
  await assertSucceeds(db.ref('directory').get())
  await assertSucceeds(db.ref(`rooms/${id}/members/applicant`).set({ role: 'leader', proof }))
  await assertSucceeds(db.ref().update(admission('applicant', 'leader')))
  await assertSucceeds(db.ref(`rooms/${id}`).get())
})

test('revoking approval blocks existing members immediately while their disconnect cleanup remains allowed', async () => {
  const leader = account('leader').database()
  await leader.ref(`rooms/${id}/members/leader`).set({ role: 'leader', proof })
  await leader.ref().update(admission('leader', 'leader'))
  await leader
    .ref()
    .onDisconnect()
    .update(departure('leader', 'leader', undefined, 'disconnected'))
  await account('admin')
    .database()
    .ref('access/leader')
    .set({ status: 'rejected', reviewedAt: timestamp, reviewedBy: 'admin' })
  await assertFails(leader.ref(`rooms/${id}`).get())
  await assertFails(leader.ref('directory').get())
  await assertFails(
    leader.ref(`rooms/${id}/messages/denied-message`).set({
      id: 'denied-message',
      uid: 'leader',
      role: 'leader',
      text: 'blocked',
      sentAt: timestamp,
      connectionId: 'leader-connection-0001',
    }),
  )
  await assertFails(leader.ref().update(admission('leader', 'leader', 'next-connection-0002')))
  leader.goOffline()
  await expect
    .poll(async () => {
      let value: unknown
      await env.withSecurityRulesDisabled(async (context) => {
        value = (await context.database().ref(`rooms/${id}/connections/leader`).get()).val()
      })
      return value
    })
    .toBeNull()
  await account('admin')
    .database()
    .ref('access/owner')
    .set({ status: 'rejected', reviewedAt: timestamp, reviewedBy: 'admin' })
  await assertFails(account('owner').database().ref().update(close))
})

test('legacy profiles can add only their own email without changing role, date or approval', async () => {
  await env.withSecurityRulesDisabled((context) =>
    context.database().ref('profiles/legacy-profile').set({ role: 'broadcast', createdAt: 100 }),
  )
  const legacy = account('legacy-profile').database()
  await assertFails(
    legacy
      .ref('profiles/legacy-profile')
      .set({ role: 'leader', createdAt: 100, email: 'legacy-profile@example.invalid' }),
  )
  await assertSucceeds(
    legacy.ref('profiles/legacy-profile/email').set('legacy-profile@example.invalid'),
  )
  await assertFails(legacy.ref('profiles/legacy-profile/email').set('someone@example.invalid'))
  await assertFails(legacy.ref('directory').get())
  await assertFails(
    account('admin')
      .database()
      .ref('access/admin')
      .set({ status: 'rejected', reviewedAt: timestamp, reviewedBy: 'admin' }),
  )
})
