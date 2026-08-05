# 소스 비교검증 도구 (comparsion)

**PB(기존 C / Pro\*C) 소스와 PB5(이관된 Java / MyBatis) 소스를 좌우로 놓고, 줄 단위로 의견을 주고받으며 이관 정합성을 검증하는 도구입니다.**

이관 담당자(PB5)와 원 업무 담당자(PB)가 같은 화면을 보면서 "여기가 다른 것 같다"를 코드 그 줄에 남기고, 답글로 확인하고, 점검 체크리스트로 진행 상황을 관리합니다.

![소스 비교 화면](docs/manual/img/01-overview.png)

---

## 무엇을 할 수 있나

| 화면 | 하는 일 |
|---|---|
| **소스 비교** | 좌(PB) · 우(PB5) 코드를 나란히 보고, 메서드 접기 / 대응 메서드 점프 / 좌우 개별 검색 / 동기 스크롤. 코드 줄에 **Shift+클릭**으로 의견을 남깁니다. |
| **의견 모아보기** | 여러 프로그램의 의견(스레드)을 모아 보고 답글·조치구분·처리완료를 진행합니다. 상태·의견유형·즐겨찾기로 거를 수 있습니다. |
| **체크리스트 모아보기** | 프로그램 × 점검 문항 매트릭스로 전체 진행률과 미판정 항목을 조망합니다. |

**특징적인 기능**

- **줄 단위 토론** — 코드 그 줄에 마커가 붙고, 마지막 글쓴이에 따라 "다음 확인 차례"가 자동으로 넘어갑니다(PB가 쓰면 → PB5 확인 필요).
- **SQL 대응 보기** — PB5 Java의 매퍼 호출 줄을 클릭하면, 대응되는 **PB 인라인 `EXEC SQL`** 과 **PB5 매퍼 XML 구문**을 나란히 비교합니다.
- **메서드 대응 점프** — `Alt+클릭` 으로 반대편 소스의 대응 메서드로 바로 이동합니다.
- **EUC-KR 자동 복원** — 레거시 PB 소스가 CP949로 저장돼 있어도 한글이 깨지지 않습니다.

> 📖 **화면별 사용법은 [사용 설명서](사용%20설명서.md)에 캡처 18장과 함께 정리돼 있습니다.**

---

## 빠른 시작

**요구사항** — Node.js 20 이상 (권장 22+), npm

```bash
# 1) 의존성 설치
npm --prefix fe install
npm --prefix be install

# 2) 백엔드 실행 (기본 포트 50004, DB 없이 목 데이터로 동작)
npm --prefix be run start

# 3) 프론트엔드 실행 (기본 포트 5173)
npm --prefix fe run dev
```

브라우저에서 <http://localhost:5173> 으로 접속합니다.

### 비교할 소스 넣기

비교 대상 소스는 저장소에 포함돼 있지 않습니다. 아래 위치에 파일을 두면 **파일명(basename)** 으로 찾습니다. 폴더 깊이는 상관없습니다.

| 구분 | 위치 | 확장자 |
|---|---|---|
| PB | `fe/src/assets/code/c/**` | `.pc` `.c` `.h` |
| PB5 | `fe/src/assets/code/java/**` | `.java` `.xml` |

화면을 바로 확인해 보려면 설명서 캡처에 쓴 샘플 소스를 복사하면 됩니다.

```bash
cp -r docs/manual/sample-src/c/. fe/src/assets/code/c/
cp -r docs/manual/sample-src/java/. fe/src/assets/code/java/
```

---

## 저장소 구조

```
comparsion/
├── fe/                     프론트엔드 (React + Vite)
│   ├── src/codeview/         코드 비교 뷰 · 검색 · 접기 · SQL 대응
│   ├── src/discussion/       의견(스레드) 보드
│   ├── src/checklist/        체크리스트 패널 · 매트릭스
│   ├── src/parser/           PB/PB5 파일명 · 메서드 파싱 전략
│   ├── src/config/           환경변수(.env.development) · 분류/유형 정의
│   └── test/                 순수 로직 단위 테스트 (vitest)
├── be/                     백엔드 (NestJS)
│   ├── src/services/         비교 대상 프로그램 카탈로그
│   ├── src/discussion-threads/  스레드
│   ├── src/discussion-message/  메시지 · 조치구분
│   ├── src/checklist/        점검 항목 · 상태
│   ├── src/config/           프로파일(MOCK / Oracle) 설정
│   ├── src/db/               커넥션 풀 · SQL 템플릿 · 트랜잭션
│   └── create.sql            테이블 정의
└── docs/
    ├── manual/               사용 설명서용 캡처 · 샘플 소스
    ├── ai/                   코딩 · 리팩토링 · 테스트 · UI/UX 가이드
    └── 한일/                 작업 기록
```

---

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | React 19, Vite 8, TypeScript, Tailwind CSS 4, Shiki(문법 강조), TanStack Virtual(가상 스크롤) |
| 백엔드 | NestJS 11, class-validator, compression |
| DB | Oracle (`oracledb`) — 목 프로파일에서는 인메모리로 대체 |
| 테스트 | vitest(프론트) / jest(백엔드) |

---

## 실제 Oracle 로 붙이기

기본값은 **DB 없이 뜨는 목(MOCK) 프로파일**입니다. 실 DB로 전환하려면:

1. `be/create.sql` 로 테이블을 만듭니다.
   - `comparsion_services` · `comparsion_discussion_thread` · `comparsion_discussion_message` · `comparsion_check_point` · `comparsion_check_list`
   - 초기 점검 항목은 `be/insert.sql` 에 있습니다.
2. `be/.env.example` 를 참고해 접속정보를 채웁니다.
3. `be/src/config/index.ts` 의 구현체를 실 DB 설정으로 교체합니다(주석에 절차가 적혀 있습니다).

프론트가 바라보는 API 주소는 `fe/src/config/.env.development` 의 `VITE_API_BASE_URL` 로 바꿉니다.

---

## 개발

```bash
npm --prefix fe test          # 프론트 단위 테스트
npm --prefix fe run lint      # 린트
npm --prefix fe run build     # 프론트 빌드 (fe/dist_next)

npm --prefix be test          # 백엔드 테스트
npm --prefix be run build     # 백엔드 빌드 (be/dist)
npm --prefix be run bundle    # 단일 파일 번들 (be/be_next) — 배포용
```

---

## 문서

| 문서 | 내용 |
|---|---|
| [사용 설명서](사용%20설명서.md) | 화면별 사용법 · 단축키 · 규칙 · FAQ (캡처 18장) |
| [be/데이터.md](be/데이터.md) | 저장 포맷과 조회 뷰 설계 |
| [fe/docs/superpowers](fe/docs/superpowers) | 기능별 설계·계획 문서 |
| [docs/ai](docs/ai) | 코딩 · 리팩토링 · 테스트 · UI/UX 가이드 |
