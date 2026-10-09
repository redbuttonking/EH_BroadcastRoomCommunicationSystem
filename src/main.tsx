import { createRoot } from 'react-dom/client'
import { App } from './App'
import { FirebaseRoomClient } from './lib/firebase-client'
import './styles.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installation support is optional; the online chat still works without it.
    })
  })
}

const emulator = import.meta.env.VITE_FIREBASE_EMULATORS === 'true'
const options = emulator
  ? {
      apiKey: 'demo-key',
      projectId: 'demo-eh-broadcast',
      authDomain: 'demo-eh-broadcast.firebaseapp.com',
      databaseURL: 'https://demo-eh-broadcast-default-rtdb.firebaseio.com',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    }
if (options.apiKey && options.projectId && options.databaseURL) {
  const client = new FirebaseRoomClient(options, emulator)
  void client.start()
  createRoot(document.getElementById('root')!).render(<App client={client} preview={emulator} />)
} else {
  createRoot(document.getElementById('root')!).render(
    <main className="setup-required">
      <h1>연결 설정이 필요합니다.</h1>
      <p>아직 Firebase 프로젝트가 연결되지 않았습니다.</p>
      <p>개발 미리보기는 README의 실행 안내를 확인해 주세요.</p>
    </main>,
  )
}
