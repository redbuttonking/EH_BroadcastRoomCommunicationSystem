import { useEffect, useState } from 'react'
import { Download, MoreVertical, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal, ModalHeader } from '@/components/ui/modal'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [installed, setInstalled] = useState(
    () =>
      matchMedia('(display-mode: standalone)').matches ||
      matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  )
  const [showGuide, setShowGuide] = useState(false)
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPrompt)
    }
    const done = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', ready)
    window.addEventListener('appinstalled', done)
    return () => {
      window.removeEventListener('beforeinstallprompt', ready)
      window.removeEventListener('appinstalled', done)
    }
  }, [])
  if (installed) return null
  return (
    <>
      <div className="install-hint">
        <span>홈 화면에서 주소창 없이 사용할 수 있어요.</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!prompt) {
              setShowGuide(true)
              return
            }
            try {
              await prompt.prompt()
              await prompt.userChoice
            } finally {
              setPrompt(null)
            }
          }}
        >
          <Download size={16} /> 앱 설치 안내
        </Button>
      </div>
      <Modal
        open={showGuide}
        onDismiss={() => setShowGuide(false)}
        className="install-dialog"
        titleId="install-title"
      >
        <ModalHeader
          title="홈 화면에 설치하기"
          titleId="install-title"
          onDismiss={() => setShowGuide(false)}
        />
        <section className="install-platform" aria-label="Android 설치 방법">
          <h3>Android · Chrome</h3>
          <ol>
            <li>
              <MoreVertical size={16} className="inline-icon" /> 메뉴를 여세요.
            </li>
            <li>
              <span className="keep-together">‘홈 화면에 추가’</span> 또는{' '}
              <span className="keep-together">‘설치 및 바로가기 만들기’</span>에서{' '}
              <span className="keep-together">‘설치’</span>를 선택하세요.
            </li>
          </ol>
        </section>
        <section className="install-platform" aria-label="iPhone 설치 방법">
          <h3>iPhone · Safari</h3>
          <ol>
            <li>
              <Share size={16} className="inline-icon" /> 공유 메뉴를 여세요.
            </li>
            <li>
              <span className="keep-together">‘홈 화면에 추가’</span>를 선택하세요.
            </li>
            <li>
              <span className="keep-together">‘웹 앱으로 열기’</span>가 보이면 켜고 추가하세요.
            </li>
          </ol>
        </section>
        <p className="install-after">
          설치 후 <span className="keep-together">‘예배소통’</span> 아이콘으로 실행하세요.
        </p>
        <p className="install-orientation">
          휴대폰을 가로로 돌리면 대화와 문구를 나란히 볼 수 있습니다.
        </p>
        <div className="dialog-actions">
          <Button onClick={() => setShowGuide(false)}>확인</Button>
        </div>
      </Modal>
    </>
  )
}
