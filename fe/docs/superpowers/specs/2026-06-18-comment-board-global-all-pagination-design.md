# 의견 모아보기 — 전체 보기 + 페이징 설계

- 작성일: 2026-06-18
- 대상: 프론트 `comparsionV2`(Vite/React) + 백엔드 `comparsion-be`(NestJS)
- 관련 파일: `src/CommentBoard.tsx`, `src/discussionService.ts`, `comparsion-be/src/discussion-threads/*`

## 1. 배경 / 문제

현재 **의견 모아보기** 탭([CommentBoard.tsx](../../../src/CommentBoard.tsx))은 의견을 두 가지 방식으로만 볼 수 있다.

1. `대분류 → 중분류 → 프로그램명`을 끝까지 골라 **한 프로그램**의 의견만 조회
2. `★ 즐겨찾기 모아보기`로 즐겨찾기한 프로그램들의 의견을 합쳐서 조회

→ **여러 프로그램의 의견을 한 화면에 모아 보는 "전체"가 없다.** 의견 수가 많아질 수 있으므로 페이징도 함께 필요하다.

백엔드 현황: `GET /services/:serviceId/discussion-threads` 는 내부적으로 `repository.findAll()`로 **thread 테이블 전체를 매번 조회**한 뒤 서비스 계층에서 JS로 serviceId 필터 + RESOLVED 제외를 한다. SQL 레벨 페이징/필터가 전혀 없다.

## 2. 목표

- 의견 모아보기에 **전체 보기** 추가.
  - 스코프 = 현재 선택된 분류. `대분류`만 → 그 대분류 전체 / `대분류+중분류` → 그 중분류 전체 / **아무 분류도 안 고르면 전 분류 글로벌 전체**.
  - 프로그램명은 특정하지 않는다(제외).
- **페이지 번호 방식** 페이징(이전/다음 + 페이지 번호 + 총건수).
- 페이징·필터·정렬을 **SQL 레벨**에서 처리(풀스캔/JS 페이징 금지 — `개발api가이드.md` 준수).

### 비목표 (YAGNI)

- 무한 스크롤 / 커서 페이징.
- per-program·즐겨찾기 모드의 페이징(데이터가 작아 현행 유지).
- RESOLVED(해결됨) 포함 보기(기존과 동일하게 제외 유지).

## 3. UX / 동작

- 선택바에 **"전체 모아보기"** 버튼 추가(기존 `★ 즐겨찾기 모아보기` 옆, 동일 톤). 항상 활성.
- 누르면 `allMode` 진입. 스코프 = 현재 `selectedBig`/`selectedMiddle`(둘 다 비면 글로벌).
- 목록 하단에 **페이지 바**: `이전 / 1 2 3 … / 다음` + `총 N건 · X/Y페이지`. 페이지 전환 시 목록 맨 위로 스크롤.
- `유형` 필터 또는 분류 변경 시 **1페이지로 리셋** 후 재조회.
- 세 모드 상호배타: 프로그램 선택 / 즐겨찾기 모아보기 / 전체 모아보기. 하나를 켜면 나머지는 해제. allMode 중 프로그램명을 직접 고르면 per-program 모드로 전환(allMode 해제). 프로그램 드롭다운은 그대로 두되 allMode 자체는 프로그램 선택을 쓰지 않는다.
- allMode에서 답글·종료·리액션 후에는 **현재 페이지를 재조회**한다. 종료(RESOLVED) 등으로 현재 페이지가 비고 `page > 1`이면 한 페이지 뒤로 이동.

## 4. API 계약 (REST 가이드 §6·§8)

신규 전역 엔드포인트(서비스 스코프 밖, 체크리스트 매트릭스와 동일한 별도 컨트롤러 패턴):

```
GET /discussion-threads?bigCategory=&middleCategory=&opinionType=&page=1&size=20
```

응답:

```json
{
  "items": [ /* 기존 thread 뷰와 동일한 객체 배열 */ ],
  "page": 1,
  "size": 20,
  "totalCount": 137
}
```

- 모든 쿼리 파라미터는 선택. `bigCategory`/`middleCategory` 미지정 = 글로벌. `opinionType` 미지정 = 유형 전체.
- `page` 기본 1(1-base), `size` 기본 20, **상한 100**(가이드 "최대 size 제한"). 범위 밖 값은 기본값/상한으로 보정.
- `RESOLVED`는 항상 제외(기존 per-service 동작과 일치).
- 기존 `GET /services/:serviceId/discussion-threads` 는 **변경하지 않는다**(시그니처 보존).

## 5. 백엔드 설계 (Approach A)

### 5.1 컨트롤러

`comparsion-be/src/discussion-threads/port/in/global-discussion-threads.controller.ts` (신규)

- `@Controller('discussion-threads')`, `@Get()` → 쿼리 파라미터를 받아 `service.findAllPaged(...)` 위임.
- `page`/`size`는 `@Query` 문자열을 정수 파싱 + 보정(가드 클로즈). discussion-threads 모듈 `controllers`에 등록.

### 5.2 서비스

`DiscussionThreadsService.findAllPaged({ bigCategory?, middleCategory?, opinionType?, page, size })`

1. 분류가 하나라도 있으면 `ServicesService.findAll()` 결과에서 분류 일치 행의 **distinct serviceId**를 모은다.
   - `ServicesService`를 `DiscussionThreadsService`에 주입(`ServicesModule` export 필요 시 추가). 단방향 의존만 사용.
   - 해석된 serviceId가 **0개면** `{ items: [], page, size, totalCount: 0 }` 즉시 반환(빈 스코프 가드 — 빈 IN 리스트로 SQL 만들지 않음).
2. `repository.findPaged({ serviceIds?, opinionType?, page, size })` 호출 → `{ items, totalCount }`.
3. `{ items, page, size, totalCount }` 반환.

> 분류→serviceId 해석을 서비스 계층에서 하므로 thread 쿼리는 `service_id IN (...)`만 쓰면 된다. 이렇게 하면 (a) `comparsion_services`가 service_id당 pb/pb5 **2행**이어서 생기는 JOIN 행 중복을 피하고, (b) 실DB·mock 동작이 동일해진다.

### 5.3 리포지토리

인터페이스 `IDiscussionThreadRepository`에 추가:

```ts
findPaged(filter: {
  serviceIds?: string[];        // 없으면 전역
  opinionType?: string;         // 없으면 유형 전체
  page: number; size: number;
}): Promise<{ items: any[]; totalCount: number }>;
```

실DB(`DiscussionThreadRepository`): 기존 `THREAD_VIEW` 재사용.

```sql
-- items
${THREAD_VIEW}
WHERE t.status <> 'RESOLVED'
  [AND t.service_id IN (:sid0, :sid1, ...)]   -- serviceIds 있을 때만
  [AND t.opinion_type = :opinionType]         -- opinionType 있을 때만
ORDER BY t.id DESC
OFFSET :offset ROWS FETCH NEXT :size ROWS ONLY

-- totalCount (JOIN 불필요 — 조건이 모두 t 컬럼)
SELECT COUNT(*) AS "cnt"
FROM comparsion_discussion_thread t
WHERE t.status <> 'RESOLVED'
  [AND t.service_id IN (:sid0, ...)]
  [AND t.opinion_type = :opinionType]
```

- IN 리스트는 `serviceIds`로 named bind(`sid0..sidN`)를 동적 생성. `offset = (page-1)*size`.
- **제약**: Oracle IN 리스트 1000개 한도. 분류 스코프 내 프로그램 수가 이를 넘으면 안 됨(현 도메인 규모에서 미도달 가정). 초과 시 해당 분기를 services JOIN 방식으로 교체 — 후속 과제.

mock(`MockDiscussionThreadRepository`): `this.threads`를 동일 술어(`status !== 'RESOLVED'`, serviceIds 포함, opinionType 일치)로 필터 → `id` 내림차순 정렬 → `offset/size` 슬라이스. `totalCount` = 필터 후 길이.

## 6. 프론트 설계

### 6.1 discussionService

```ts
getThreadsPaged(params: {
  bigCategory?: string; middleCategory?: string;
  opinionType?: OpinionType; page: number; size: number;
}): Promise<{ items: DiscussionThread[]; page: number; size: number; totalCount: number }>
```

- 쿼리스트링 조립(빈 값은 생략), 응답 `items`를 기존 `getThreads`와 **동일한 매핑 규칙**으로 `DiscussionThread`로 변환.

### 6.2 CommentBoard

- 상태 추가: `allMode: boolean`, `page: number`, `totalCount: number`. 페이지 크기 상수 `PAGE_SIZE = 20`.
- `대분류/중분류` 선택 핸들러: allMode일 때는 프로그램 선택 단계로 가지 않고, 스코프 변경 시 1페이지 재조회.
- "전체 모아보기" 버튼: `toggleAllMode()` — 켜면 favMode 해제·selectedProgram 클리어 후 1페이지 조회.
- allMode 렌더링: 서버가 정렬·필터·페이징을 끝낸 `items`를 **그대로** 표시(클라 `sortThreadsForBoard`·`visible` 우회). 유형 필터 클릭 → `opinionFilter` 변경 + page=1 재조회.
- 페이지 바 컴포넌트: 총건수, 현재/전체 페이지, 이전/다음/번호. `totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))`.
- `reload()`: allMode면 현재 페이지 재조회(빈 페이지면 page>1일 때 감소 후 재조회) 분기 추가.
- per-program·favorites 모드는 기존 클라 정렬/필터/비페이징 동작 그대로 유지.

## 7. 정렬·필터 결정

- 정렬: **최신순(`t.id DESC`)** — 기존 `findAll` 기본과 일치, 다중 프로그램에서 줄번호 혼합보다 직관적, 페이징에 안정적.
- 유형 필터: allMode는 **서버사이드**(페이징과 정합성 유지). 다른 모드는 현행 클라 필터 유지.
- 상태: `RESOLVED` 제외(기존과 동일).

## 8. 테스트 (테스트가이드)

- `DiscussionThreadsService.findAllPaged`
  - 분류 미지정(글로벌) — 전체에서 페이지 슬라이스, totalCount 정확.
  - 분류 지정 — 해당 serviceId만 포함.
  - 빈 스코프(분류는 줬지만 매칭 serviceId 0개) → `{items:[], totalCount:0}` (404 아님).
  - `opinionType` 필터, RESOLVED 제외.
  - 페이지 경계(마지막 페이지 부분 채움, 범위 밖 page).
- `MockDiscussionThreadRepository.findPaged` — 필터/슬라이스/카운트.
- 행동(출력) 검증 위주, 내부 구현 mock 금지. 기존 `discussion-threads.service.spec.ts` 패턴 확장.

## 9. 마무리

- 빌드 검증: FE `vite build`, BE `nest build`(build-verification 메모리 기준).
- 작업 후 `docs/한일/2026-06-18.md`에 기록 — **외부 API 변경(신규 `GET /discussion-threads` 추가) 명시**.
