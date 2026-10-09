import { loadEnv } from 'vite'
import { spawnSync } from 'node:child_process'

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env }
const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
]
if (
  env.VITE_FIREBASE_EMULATORS !== 'false' ||
  env.VITE_FIREBASE_PROJECT_ID !== 'eh-worship-chat' ||
  required.some((key) => !env[key])
) {
  console.error(
    'Production build requires the eh-worship-chat Firebase configuration and VITE_FIREBASE_EMULATORS=false.',
  )
  process.exit(1)
}
for (const file of ['node_modules/typescript/bin/tsc', 'node_modules/vite/bin/vite.js']) {
  const result = spawnSync(
    process.execPath,
    [file, ...(file.endsWith('/tsc') ? ['-b'] : ['build'])],
    { env, stdio: 'inherit' },
  )
  if (result.status !== 0) process.exit(result.status || 1)
}
