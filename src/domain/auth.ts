export const ACCOUNT_PASSWORD_MIN = 8
export const ACCOUNT_PASSWORD_MAX = 128

export function authenticationError(error: unknown): string {
  const code = (error as { code?: string })?.code
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return '이메일 또는 비밀번호가 맞지 않습니다.'
    case 'auth/email-already-in-use':
      return '이미 가입한 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.'
    case 'auth/invalid-email':
      return '이메일 주소를 확인해 주세요.'
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return '비밀번호가 가입 조건에 맞지 않습니다. 더 긴 비밀번호로 다시 입력해 주세요.'
    case 'auth/too-many-requests':
      return '요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요.'
    case 'auth/network-request-failed':
      return '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
    case 'auth/user-disabled':
      return '사용이 중지된 계정입니다. 서비스 관리자에게 문의해 주세요.'
    case 'auth/operation-not-allowed':
      return '현재 로그인을 사용할 수 없습니다. 서비스 관리자에게 문의해 주세요.'
    default:
      return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }
}
