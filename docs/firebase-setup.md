# 실제 Firebase 연결 안내

최신 운영·복구 절차는 이 문서 마지막의 ‘보안 보완 이후 운영 절차’를 기준으로 한다. 아래 날짜별 기록에는 당시의 인증 방식도 남겨 두었다.

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


## 보안 보완 이후 운영 절차 — 2026-10-09

- 신규·기존 사용자와 관리자 모두 본인 이메일 인증 후 이용한다. 화면에서 ‘인증 메일 보내기’ → 받은 메일의 인증 링크 → ‘인증 완료 확인’ 순서다. 기존 승인은 유지하며 신규 계정은 추가로 관리자 승인이 필요하다. 관리자도 본인 인증을 생략하지 않는다. 로컬 에뮬레이터에서는 실제 메일 대신 터미널의 인증 링크 또는 Auth 에뮬레이터 OOB 코드를 사용한다.
- 로그인만으로 대화를 읽을 수 없다. 승인·이메일 인증·방 비밀번호 검증·실제 역할 자리 점유를 모두 확인한다. 같은 계정의 다른 기기도 그 계정이 방에 참여 중이면 동일한 계정 권한을 가지므로, 계정 비밀번호는 승인받은 사용자만 사용한다.
- 생성자별 방은 최대 3개다. 방을 완전히 닫으면 자리가 반환된다. 기존 방을 자동 삭제하지 않으며, 관리자는 홈에서 현재 참여자가 없는 방만 삭제할 수 있다. 승인 취소된 생성자의 빈 방도 이 방식으로 정리한다.
- 메시지는 최근 100개부터 읽고 이전 기록은 추가 조회한다. 서버는 조회당 최대 100개와 계정·방별 0.5초 전송 간격을 검사한다. 이는 무료 사용량을 줄이는 장치이며 프로젝트 전체의 다운로드·저장량 한도를 보장하는 장치는 아니다. Firebase 콘솔의 Realtime Database와 Hosting 사용량을 예배 전 확인한다. 방 삭제로 이미 사용한 다운로드 양이 복구되지는 않는다.
- 화면 꺼짐 방지는 방 상단에서 직접 켜고 나가면 해제된다. 운영체제의 절전 정책이나 브라우저 제한으로 해제될 수 있다. 실제 교회 휴대폰과 Mac의 Safari에서 잠금·백그라운드 전환·통신 복귀를 확인한다.

### 검사와 직접 배포

`npm run build:production`은 에뮬레이터 설정이나 다른 프로젝트 ID로 잘못 빌드하는 것을 차단한다. 사용자 이용이 없는 시간에 단위·규칙·브라우저 검사와 운영 빌드를 통과한 버전을 배포한다.

```sh
npm run backup:settings
npm run build:production
npx firebase deploy --only database,hosting --project eh-worship-chat --non-interactive
```

Hosting에는 CSP, 외부 프레임 삽입 차단, 권한 제한 헤더가 적용된다. Firebase 이메일 인증·비밀번호 재설정용 `/__/` 예약 경로에는 앱의 CSP를 덮어쓰지 않는다. RTDB가 WebSocket 대신 사용하는 long polling도 허용한다. 운영 빌드 파일에 계정 비밀번호·CLI 인증·서비스 계정 키를 넣지 않는다.

### 백업과 복구

`npm run backup:settings`는 로그인한 Firebase CLI로 profiles·access·administrators·presets만 `.backups/시간/`에 저장한다. 방·채팅·방 비밀번호 검증값·Authentication 비밀번호·CLI 토큰은 포함하지 않는다. 파일에는 이메일과 사용자 문구가 있으므로 비공개 보관하고 Git·공개 첨부에 올리지 않는다. 일부 읽기가 실패하면 명령이 실패하며, manifest.json이 없는 폴더는 완료된 백업으로 취급하지 않는다. 컬렉션별 순차 읽기라 변경 중의 원자적 스냅샷은 아니다.

복구 시 먼저 현재 상태를 별도로 백업한다. 대상 계정이 Authentication에 남아 있는지 확인한 뒤 필요한 UID의 설정만 비교하여 복원한다. 예를 들어 잘못 지운 문구는 백업 presets.json에서 해당 UID 하위 내용을 별도 비공개 JSON 파일로 추출하고 Firebase CLI의 `database:set /presets/대상UID 추출파일 --project eh-worship-chat`로 복원한다. 승인과 관리자 권한은 계정별로 현재 의도를 확인한 후 복원한다. 전체 루트 덮어쓰기나 Authentication 계정 재생성을 자동으로 수행하지 않는다. 방과 대화는 백업 대상이 아니므로 완전히 닫은 방의 대화는 이 백업으로 복구할 수 없다.

화면 배포에 문제가 있으면 Firebase Hosting 콘솔의 릴리스 기록에서 검증된 이전 버전을 복원한다. Hosting 롤백은 데이터베이스 규칙까지 되돌리지 않는다. 규칙 문제가 있으면 수정한 규칙을 에뮬레이터에서 검증하여 별도로 배포한다. 이전 앱과 현재 규칙의 호환성을 먼저 확인하며, 편의를 위해 인증·승인·대화 접근 제한을 제거하지 않는다.

### GitHub 검사와 선택적 배포

`.github/workflows/ci.yml`은 main 변경과 PR에서 포맷·운영 의존성 취약점·단위·에뮬레이터 규칙·Chromium/WebKit 화면 검사를 수행하도록 작성했다. 실제 프로젝트 대신 demo 에뮬레이터를 사용한다. 개발 도구의 취약점 알림은 Dependabot으로 확인하며 자동 병합하지 않는다.

`.github/workflows/deploy.yml`은 main에서 수동으로 실행하고 확인란에 deploy를 입력한 뒤, 같은 검사가 통과해야 배포하게 구성했다. production 환경의 FIREBASE_API_KEY·FIREBASE_AUTH_DOMAIN·FIREBASE_DATABASE_URL·FIREBASE_WIF_PROVIDER·FIREBASE_DEPLOY_ACCOUNT 변수가 필요하다. 장기 서비스 계정 비밀 키 대신 저장소·main·배포 워크플로·수동 실행으로 제한한 Workload Identity Federation을 사용하도록 준비했다. Firebase 웹 API 키는 앱 식별용이며 관리자 비밀 키가 아니다.

사용자가 배포 계정·권한·인증 연결 생성을 명시적으로 승인하여 연결을 완료했다. github-deploy 서비스 계정에 Hosting·Realtime Database 관리, Firebase 조회, API 사용 권한을 부여했다. 인증은 저장소 ID와 소유자 ID, main 브랜치, deploy.yml, workflow_dispatch가 모두 일치할 때만 허용한다. 사용자 관리 서비스 계정 키는 0개이며 결제 연결도 없다. production 환경 변수 5개를 설정했다. 자동 검사 파일은 공개 저장소에 반영했다. 실행 결과는 GitHub Actions의 각 검사·배포 기록에서 확인한다.

보안 보완 버전은 직접 Firebase CLI로 Hosting·규칙에 배포하고 실제 주소의 파일 12개, 헤더, 대화 흐름과 권한 차단을 검증했다. 이후 GitHub 배포 전용 인증 연결도 완료했다.


배포 실행은 GitHub 저장소의 Actions → Deploy verified version → Run workflow에서 main을 선택하고 확인란에 deploy를 입력한다. 검사 실패 시 배포는 실행되지 않는다. 단순 커밋·푸시는 자동 검사만 시작하며 사이트를 바꾸지 않는다. GitHub 배포의 결과와 배포에 사용한 커밋은 Actions의 Deploy verified version 실행 기록에서 확인한다.
