import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Deliberately excludes chats, room passwords, Auth password hashes and CLI credentials.
const project = 'eh-worship-chat'
const directory = resolve('.backups', new Date().toISOString().replaceAll(':', '-'))
const collections = ['profiles', 'access', 'administrators', 'presets']
await mkdir(directory, { recursive: true })
for (const name of collections) {
  const output = resolve(directory, `${name}.json`)
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/firebase-tools/lib/bin/firebase.js',
      'database:get',
      `/${name}`,
      '--project',
      project,
      '--output',
      output,
      '--non-interactive',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (result.status !== 0) {
    await rm(output, { force: true })
    console.error(
      `Backup of ${name} failed. Check Firebase CLI login and access; prior files remain in ${directory}.`,
    )
    process.exit(1)
  }
  JSON.parse(await readFile(output, 'utf8'))
}
await writeFile(
  resolve(directory, 'manifest.json'),
  JSON.stringify({ project, createdAt: new Date().toISOString(), collections }, null, 2),
  { flag: 'wx' },
)
console.log(
  `Settings backup saved locally: ${directory}. Contains account emails; keep it private.`,
)
