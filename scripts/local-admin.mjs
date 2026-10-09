// This helper only addresses the demo emulators on localhost, never a cloud project.
const email = process.argv[2]?.trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: npm run local:admin -- your-local-test-email@example.invalid')
  process.exit(1)
}
const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
const authEndpoint =
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-eh-broadcast/accounts:batchGet'
const databaseEndpoint = 'http://127.0.0.1:9000/.json?ns=demo-eh-broadcast-default-rtdb'
try {
  let nextPageToken
  let user
  do {
    const url = new URL(authEndpoint)
    url.searchParams.set('maxResults', '1000')
    if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken)
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('Could not read local emulator accounts.')
    const data = await response.json()
    user = data.users?.find((account) => account.email?.toLowerCase() === email)
    nextPageToken = data.nextPageToken
  } while (!user && nextPageToken)
  if (!user || user.disabled) throw new Error('Create an enabled account in the local app first.')
  const uid = user.localId
  const response = await fetch(databaseEndpoint, {
    method: 'PATCH',
    headers,
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      [`administrators/${uid}`]: true,
      [`access/${uid}`]: {
        status: 'approved',
        reviewedBy: uid,
        reviewedAt: { '.sv': 'timestamp' },
      },
    }),
  })
  if (!response.ok) throw new Error('Could not configure the local emulator administrator.')
  console.log('Local emulator administrator is ready. The app updates automatically.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
