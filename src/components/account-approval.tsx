import { useEffect, useState } from 'react'
import { Check, Clock3, LoaderCircle, ShieldCheck, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal, ModalHeader } from '@/components/ui/modal'
import { ROLE_NAMES } from '@/domain/types'
import type {
  AccountApplication,
  ApprovalStatus,
  ClientState,
  RoomTransport,
} from '@/domain/transport'

export function AccountApproval({ state }: { state: ClientState }) {
  const failed = state.accessError || state.profileError
  const loading = !state.accessReady || !state.profileReady
  const rejected = state.account?.approval === 'rejected'
  const Icon = failed ? ShieldCheck : loading ? LoaderCircle : rejected ? ShieldCheck : Clock3
  return (
    <div className="approval-status" role={failed ? 'alert' : 'status'}>
      <Icon size={30} strokeWidth={1.5} className={loading && !failed ? 'auth-spinner' : ''} />
      <h2>
        {failed
          ? '계정 확인이 필요합니다'
          : loading
            ? '이용 권한을 확인하고 있습니다'
            : rejected
              ? '이용 승인이 거절되었습니다'
              : '관리자 승인을 기다리고 있어요'}
      </h2>
      <p>
        {failed ||
          (loading
            ? '잠시만 기다려 주세요.'
            : rejected
              ? '교회 관리자에게 계정 확인을 요청해 주세요.'
              : '가입 신청이 접수되었습니다. 승인되면 방 목록이 자동으로 표시됩니다.')}
      </p>
      {!loading && !failed && <p className="auth-hint">승인 전에는 대화방을 이용할 수 없습니다.</p>}
    </div>
  )
}

const STATUS_NAMES: Record<ApprovalStatus, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '거절됨',
}

export function ApprovalAdmin({ client, ownUid }: { client: RoomTransport; ownUid: string }) {
  const [applications, setApplications] = useState<AccountApplication[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<ApprovalStatus>('pending')
  const [review, setReview] = useState<{
    application: AccountApplication
    status: 'approved' | 'rejected'
  } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(
    () =>
      client.watchApplications(
        (next) => {
          setApplications(next)
          setReady(true)
          setError('')
        },
        (message) => {
          setApplications([])
          setReady(true)
          setError(message)
        },
      ),
    [client],
  )
  const visible = applications.filter(
    (application) => application.status === filter && application.uid !== ownUid,
  )
  const approving = review?.status === 'approved'
  const removingApproval = review?.application.status === 'approved'
  const title = approving
    ? '이 계정을 승인할까요?'
    : removingApproval
      ? '이용 승인을 취소할까요?'
      : '가입 신청을 거절할까요?'
  return (
    <section className="approval-admin" aria-label="가입 승인 관리">
      <div className="approval-admin-heading">
        <div>
          <h2>가입 승인 관리</h2>
          <p>이메일과 신청한 역할을 확인해 주세요.</p>
        </div>
      </div>
      <div className="approval-filters" aria-label="가입 상태별 보기">
        {(['pending', 'approved', 'rejected'] as const).map((status) => (
          <Button
            key={status}
            size="sm"
            variant={filter === status ? 'default' : 'outline'}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {STATUS_NAMES[status]}{' '}
            <span>
              {applications.filter((item) => item.status === status && item.uid !== ownUid).length}
            </span>
          </Button>
        ))}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {!ready ? (
        <p role="status">가입 신청을 불러오고 있습니다.</p>
      ) : !error && visible.length === 0 ? (
        <p className="approval-empty">{STATUS_NAMES[filter]} 계정이 없습니다.</p>
      ) : (
        <ul className="approval-list">
          {visible.map((application) => (
            <li key={application.uid} data-account-uid={application.uid}>
              <UserRound size={18} aria-hidden="true" />
              <div className="approval-person">
                <span className="approval-email">{application.email}</span>
                <span>
                  {ROLE_NAMES[application.role]} ·{' '}
                  {new Date(application.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </div>
              <div className="approval-actions">
                {application.status !== 'approved' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setError('')
                      setReview({ application, status: 'approved' })
                    }}
                  >
                    <Check size={16} /> 승인
                  </Button>
                )}
                {application.status !== 'rejected' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setError('')
                      setReview({ application, status: 'rejected' })
                    }}
                  >
                    <X size={16} /> {application.status === 'approved' ? '승인 취소' : '거절'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!review}
        onDismiss={() => setReview(null)}
        titleId="approval-review-title"
        disabled={busy}
      >
        <ModalHeader
          title={title}
          titleId="approval-review-title"
          onDismiss={() => setReview(null)}
          disabled={busy}
        />
        <p className="approval-email">{review?.application.email}</p>
        <p>
          {review && ROLE_NAMES[review.application.role]} ·{' '}
          {approving
            ? '이 역할로 대화방을 이용할 수 있게 됩니다.'
            : removingApproval
              ? '이 계정의 방 접근과 대화가 중단됩니다.'
              : '이 계정은 대화방을 이용할 수 없습니다.'}
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            variant={approving ? 'default' : 'destructive'}
            disabled={busy}
            onClick={async () => {
              if (!review || busy) return
              setBusy(true)
              setError('')
              try {
                await client.reviewApplication(review.application.uid, review.status)
                setReview(null)
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : '처리하지 못했습니다. 다시 시도해 주세요.',
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy
              ? '처리하고 있습니다…'
              : approving
                ? '승인하기'
                : removingApproval
                  ? '승인 취소하기'
                  : '거절하기'}
          </Button>
        </div>
      </Modal>
    </section>
  )
}
