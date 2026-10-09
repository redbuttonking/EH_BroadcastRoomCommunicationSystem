# 실제 Firebase 연결 안내

2026-10-09 현재 CLI Google 로그인과 실제 프로젝트 생성까지 완료했다. 프로젝트 ID는 사용자가 정한 `eh-worship-chat`이다. Google이 한글 프로젝트 이름을 거절하여 사용자 확인 후 관리용 이름을 ‘EH Worship Chat’으로 생성했다. 서비스 화면 이름은 후속 요청에 따라 ‘은혜장로교회 예배소통 시스템’으로 변경했다.

웹 앱 등록, 싱가포르(`asia-southeast1`) 기본 Realtime Database 생성, 이메일·비밀번호 인증 설정, 보안 규칙 배포, `.firebaserc`와 Git에서 제외되는 `.env.local` 연결, 운영 빌드와 실제 통신 검증을 완료했다. 결제 조회 결과는 `billingEnabled: false`이며 연결된 결제 계정이 없다. 사용자 배포 요청에 따라 정적 Hosting 배포도 완료했으며 서비스 주소는 [https://eh-worship-chat.web.app](https://eh-worship-chat.web.app)이다.

사용자의 ‘배포 하자 그러면’ 요청으로 앞선 배포 보류 결정을 변경했다. `npm run build` 후 `npx.cmd firebase deploy --only hosting --project eh-worship-chat --non-interactive`로 `dist`의 웹사이트 파일 3개를 배포했다. `.env.local`·관리자 인증 정보·개발 도구는 Hosting 업로드 대상이 아니다. 현재 PC의 운영 빌드 미리보기는 `npm run preview -- --port 4173`으로도 실행할 수 있다.

실제 Firebase에 연결한 Chromium 두 화면으로 방 생성, 잘못된 비밀번호 거절, 문구 전송과 일반 채팅의 양방향 수신, 새로고침과 재입장 시 기록 복원, 새 인증 세션의 방송실이 방을 완전히 닫는 동작을 확인했다. 서버에서도 해당 방과 목록 항목이 함께 삭제된 것을 조회했고 테스트용 익명 계정 3개를 제거했다. 이 검증은 Windows Chromium에서 수행했으며 실제 휴대폰·Mac Safari 검증을 대신하지 않는다.

배포 후 동일한 주요 동작을 공개 HTTPS 주소에서 다시 검증해 통과했다. 배포 검증에서 새로 만든 테스트 방과 익명 계정 3개도 정리했다. 기존 사용자의 방과 대화는 변경하지 않았다.

## 비용 없는 구성

Firebase Spark 요금제에서 Authentication의 이메일·비밀번호 인증, Realtime Database, 정적 Hosting을 사용한다. Cloud Functions·App Hosting·별도 서버·유료 도메인은 필요하지 않다. 프로젝트에 결제 계정이나 무료 체험 크레딧을 연결하지 않는다. 자동 결제를 막는 것과 무료 한도 초과에도 계속 작동하는 것은 다르다. Spark는 한도 초과 시 해당 서비스가 제한될 수 있다. [공식 요금제 설명](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Hosting 사용량 설명](https://firebase.google.com/docs/hosting/usage-quotas-pricing).

예배를 마친 후 방송실이 ‘방을 완전히 닫기’를 선택하면 해당 방의 데이터가 삭제된다. 이미 발생한 다운로드 사용량은 데이터 삭제로 되돌아가지 않는다. 방 유지 기능을 선택하면 대화도 남으므로 이전 방을 계속 방치하지 않고 정리한다. 사용량은 Firebase 콘솔에서 확인한다.

## 연결할 항목

CLI 로그인을 다시 해야 한다면 프로젝트 터미널에서 `npx.cmd firebase login --interactive`를 실행한다. 이 PC에서는 열린 Google 브라우저에서 로그인·접근 승인 후 localhost 콜백으로 CLI 인증 완료를 확인했다. `npx.cmd firebase login:list`로 상태를 확인할 수 있다. localhost 연결이 불가능할 때는 `--no-localhost`를 추가하고 명령이 안내하는 절차를 따른다. 인증 코드를 채팅·문서·저장소에 복사하지 않는다.

Authentication은 최초에 익명 제공자로 시작했으며 2026-10-09 이메일·비밀번호 로그인으로 전환했다. `subtype: FIREBASE_AUTH`, `signIn.email.enabled: true`, `passwordRequired: true`를 확인했다. 익명 제공자는 비활성화했다. Identity Platform 업그레이드나 결제 등록은 하지 않았다.

1. Firebase 프로젝트의 Spark 요금제를 확인한다. 이미 다른 앱이 같은 프로젝트를 쓰면 사용량과 보안 규칙 영향을 함께 확인한다.
2. 웹 앱을 등록하고 Authentication의 이메일/비밀번호 제공자를 켠다. 이메일 링크 로그인은 사용하지 않는다. Anonymous 제공자는 끈다. 실제 사용 계정은 서비스 홈의 회원가입에서 생성한다.
3. Realtime Database를 생성하고 실제 데이터베이스 URL을 확인한다. Firestore가 아니다. 개발용 전체 공개 테스트 규칙으로 운영하지 않는다.
4. `.env.example`을 참고해 Git에서 제외되는 `.env.local`에 웹 설정 네 개를 입력한다. `VITE_FIREBASE_EMULATORS=false`를 설정한다. 서비스 계정 JSON·관리자 비밀 키·방 비밀번호는 넣지 않는다.
5. 운영 빌드와 테스트를 통과한 뒤 `firebase/database.rules.json` 및 정적 Hosting 설정을 검토하여 해당 프로젝트에 배포한다. 현재 `.firebaserc` 기본 프로젝트는 `eh-worship-chat`이며 데이터베이스 규칙은 배포했다. `npm run dev:local`과 자동 테스트는 명시적 demo 프로젝트·에뮬레이터 설정으로 실제 데이터베이스와 분리한다.
6. 새 프로젝트에서는 최초 관리자를 별도로 지정한다. 서비스에서 가입한 계정의 UID를 Authentication에서 확인하고, 신뢰된 Firebase 콘솔 또는 관리 도구로 `administrators/{uid}: true`와 `access/{uid}: {status: "approved", reviewedBy: "해당UID", reviewedAt: 현재밀리초시각}`을 설정한다. 그 뒤 일반 가입 승인은 서비스 홈의 ‘가입 승인 관리’에서 처리한다. 이메일 문자열을 클라이언트 코드에 넣어 관리자로 판별하지 않는다. 기존 운영 프로젝트의 지정 관리자는 이미 설정되어 있다.

```dotenv
VITE_FIREBASE_EMULATORS=false
VITE_FIREBASE_API_KEY=웹앱의_apiKey
VITE_FIREBASE_PROJECT_ID=프로젝트_ID
VITE_FIREBASE_AUTH_DOMAIN=프로젝트의_authDomain
VITE_FIREBASE_DATABASE_URL=Realtime_Database_URL
```

웹 설정은 앱 식별 정보이지 방 접근 비밀번호가 아니다. 실제 접근은 이메일·비밀번호 인증과 Realtime Database 규칙이 검사한다. API 키 제한을 사용할 때는 실제 Hosting 주소와 Firebase 인증 API가 작동하는지 확인해야 한다.

## 배포 전에 확인할 동작

회원가입, 로그아웃·재로그인, 새로고침과 브라우저 재시작의 로그인 유지, 같은 계정의 중복 역할 차단, 다른 탭에서 로그아웃 후 자리 해제를 확인한다. 비밀번호 재설정은 에뮬레이터의 OOB 코드로 끝까지 시험하며, 실제 복구에는 수신 가능한 이메일이 필요하다.

승인 전 방 목록·입장·기존 대화 접근이 서버에서 거절되는지, 관리자 승인 후 재로그인 없이 방 목록이 나타나는지 확인한다. 관리자 거절·승인 취소·자기 승인 차단도 검사한다. 기존 일반 회원도 승인 대상이며, 관리자 권한은 방송실 역할과 별개다. 로컬에서는 가입 후 `npm run local:admin -- 테스트이메일`로 최초 관리자를 지정한다.

관리자는 로그인 후 기본 홈에서 방 목록과 승인 관리 버튼을 볼 수 있어야 한다. 계정 역할 설정 없이 새 방을 만들고 기존 방에 두 역할 중 하나로 입장할 수 있는지 확인한다. 이전에 저장한 역할이 있는 관리자도 같은 방식으로 사용할 수 있어야 한다. 일반 계정의 역할 제한과 관리자에게도 적용되는 역할별 한 명 제한·방 생성자의 종료 권한은 유지되는지 검사한다.

동일 비밀번호로 두 기기 입장, 잘못된 비밀번호 거절, 문구 반복과 채팅, 글자 확대·다크/화이트 전환, 새로고침 후 기록 복원, 방송실의 방 유지 나가기와 완전 닫기, 네트워크 단절 뒤 재입장을 확인한다. 방을 닫은 뒤 콘솔에서 rooms와 directory의 해당 항목이 함께 사라졌는지 확인한다.

사용자가 Android Chrome에서 첫 배포를 시험하고 모바일 화면 개선을 요청했다. 후속 설치형 웹앱은 Windows Chromium에서 검사했으며 실제 휴대폰 설치와 교회 Mac Safari 현장 검증은 남아 있다. 운영 주소는 하나를 정해 사용한다. 오프라인 안내만 저장하는 서비스 워커를 추가했으며, 실행 중 화면을 강제로 새로고침하지 않는다.

프로젝트가 준비되지 않은 상태에서도 `npm run dev:local`로 동일한 Firebase API와 규칙을 로컬에서 시험할 수 있다. 에뮬레이터는 실제 과금 계정에 연결하지 않는다.

## 휴대폰 피드백 반영 배포 — 2026-10-08

역할별 1명 입장 제한, 입장·퇴장·연결 끊김 알림, 방 안 문구 편집과 기기별 저장, 작은 터치 화면 조정 및 PWA 설치 기능을 `firebase deploy --only "database,hosting" --project eh-worship-chat --non-interactive`로 반영했다. 데이터베이스 규칙과 Hosting 파일 9개를 배포했다. 요금제·결제 계정·별도 서버 설정은 변경하지 않았다.

기존에 열어 둔 브라우저는 새로고침해야 새 접속 규칙과 화면을 사용한다. 업데이트 전에 열어 둔 방·기록은 삭제하지 않는다. 실제 배포 주소에서 테스트 전용 방으로 중복 방송실 차단, 비밀번호 검증, 양방향 메시지, 문구 편집 후 새로고침 시 유지, 퇴장 알림, 방송실 교체 후 재입장·전체 종료를 확인했다. 시험 방과 해당 실행의 임시 익명 계정 4개만 정리했다.

Android Chrome에서는 메뉴 → 홈 화면에 추가 또는 앱 설치 후 생성된 아이콘으로 실행한다. 주소창이 없는 실행은 설치된 아이콘에서 시작해야 한다. 실제 휴대폰 설치 여부·기기별 키보드와 화면 잠금 동작은 현장 확인 대상으로 남아 있다.

같은 날 후속 화면 개선은 `firebase deploy --only hosting --project eh-worship-chat --non-interactive`로 배포했다. 문구 분류 제거·드래그 정렬·스크롤 표시·한국어 줄바꿈·홈과 설치 이름·전체 화면 설정을 포함한다. 새 이미지 아이콘은 검토 파일로만 보관했다. 인증 방식과 기존 익명 사용자 계정은 변경하지 않았다. 공개 주소의 파일 9개와 실제 대화 흐름을 검증했고, 검증에서 새로 만든 방과 임시 계정 4개만 정리했다. OS 상태바 숨김은 실제 기기의 전체 화면 지원에 따라 다르다.

## 이메일 로그인 전환 — 2026-10-09

홈의 로그인·회원가입·비밀번호 재설정과 보안 규칙을 함께 배포했다. 계정 비밀번호는 Firebase Authentication이 관리하며 Realtime Database에 저장하지 않는다. 방 비밀번호와는 별개다. 방을 닫아도 로그인 계정은 유지된다. 기존 익명 사용자 레코드와 사용자의 기존 방은 삭제하지 않았다. 새 버전을 쓰려면 열어 둔 웹앱을 다시 열거나 새로고침한다.

이전 익명 연결은 이미 입장한 방 읽기와 자기 퇴장 정리만 허용한다. 새 방 생성·입장·메시지·방 닫기는 이메일 로그인으로 제한한다. 이는 이전 앱이 읽기 권한 오류에 반응해 퇴장 예약을 취소하고 자리를 남기는 일을 피하기 위한 호환 처리다. 인증 제공자를 꺼도 기존 계정 자체를 삭제하는 것은 아니다.

실제 Hosting 반영 후 파일 12개의 해시가 운영 빌드와 일치했다. 공개 주소에서 회원가입·로그아웃·재로그인, 같은 브라우저의 다른 탭 로그아웃 후 자리 해제와 재입장, 중복 역할 차단, 방 비밀번호 검증, 양방향 대화, 문구 편집 유지, 재입장과 방 닫기를 확인했다. 배포 전·후 검증마다 생성한 테스트 계정 4개와 해당 테스트 방만 정리했다. 결제 계정 미연결(`billingEnabled: false`)과 이메일 제공자 활성화·익명 제공자 비활성화를 다시 확인했다.
