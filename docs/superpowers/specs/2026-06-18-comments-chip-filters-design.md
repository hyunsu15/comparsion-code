# 의견 모아보기 — 유형/업무 칩 기반 동등 필터 — 설계

작성일: 2026-06-18

## 배경 / 목표

의견 모아보기의 유형/업무 필터가 소스 비교와 공유하는 `CategorySelector`의 **3단 종속 드롭다운**(유형→업무→프로그램, 업무는 유형 선택 전 `disabled`)이라 불편: ①업무를 바로 못 고름(캐스케이드) ②드롭다운에 '전체' 없음 ③'유형' 라벨이 분류·의견 두 곳에 중복.

**목표(사용자 승인, UI/UX 추천):** 유형/업무를 **칩 기반 동등 필터**로 — 순서 강제 없이 한 클릭, '전체' 내장, 활성 가시화. 체크리스트 모아보기/의견유형 필터와 같은 "클릭해서 거른다" 언어로 통일.

## 동작 (확정)

- **유형 칩**: `[전체] [회원] [계좌] …` (distinct `big_category`, `sortBigCategories` 순). 클릭 시 그 유형으로 집계 스코프.
- **업무 칩**: `[전체] [인증] [이체] …` (distinct `middle_category`; 유형 선택 시 그 유형의 업무만, 유형 전체면 전 업무). **유형과 무관하게 바로 클릭 가능**(캐스케이드/비활성 없음).
- 칩 클릭 = 집계(`allMode`) 모드 보장 + 스코프 재조회(기존 effect `[allMode, selectedBig, selectedMiddle, opinionFilter]` 활용). 유형 변경 시 현재 업무가 그 유형에 없으면 업무를 전체로 되돌림('전체' 유형은 업무 유지).
- **의견 유형 줄**: 라벨 `유형` → **`의견 유형`** (충돌 제거). 칩 동작 그대로.
- **초기화**: 유형/업무/의견유형/프로그램 모두 전체로, `allMode` 글로벌 복귀.
- **프로그램 보기(드릴)**: 보조 — 검색형 입력(`<input list>` datalist, 현재 유형/업무 스코프의 service_id). 선택 시 단일 프로그램 모드(`allMode` off). 게이트 아님.
- 즐겨찾기 모아보기·전체 모아보기 버튼 유지.

## 변경 (FE only, `CommentBoard.tsx`)

- `CategorySelector` 사용 중단(소스 비교 `CodeComparator`는 계속 사용 → 컴포넌트 자체 불변).
- import `sortBigCategories` (config/categoryOrder).
- `useMemo`로 `typeOptions`(services→distinct big_category 정렬), `workOptions`(selectedBig 스코프 distinct middle_category), `programOptions`(selectedBig/Middle 스코프 service_id).
- 핸들러: `selectType(big)`(favMode off·program clear·업무 정합성·`setAllMode(true)`), `selectWork(middle)`(동일), `resetFilters()`(전부 전체+글로벌).
- 인디고 선택바의 `<CategorySelector>` → 칩 2줄(유형/업무, 인디고바 대비 스타일: 비활성 indigo-500/white, 활성 흰/amber) + 프로그램 검색 + 즐겨찾기/전체/초기화.
- 의견유형 줄 라벨 텍스트만 `의견 유형`.

## 검증

- `tsc --noEmit`(CommentBoard 무에러) · `vitest`(기존 그린) · `vite build`. 가시 동작은 BE 기동 시 확인.
- 외부 API 변경: 없음(필터 UI만; 서버 쿼리 인자 `bigCategory/middleCategory/opinionType`는 동일).

## 비목표

- `CategorySelector`/소스 비교 탭 변경 없음. ChecklistBoard와 헬퍼 공유(리팩토링)는 이번 범위 밖(동시 편집 파일이라 회피) — 파생은 CommentBoard 인라인.

## ⚠️ 동시 편집 주의

`CommentBoard.tsx`는 동시 세션이 활발히 편집 중(이번 세션에 2회 수정 관측) → 편집 직전 최신 전체본 재확인, 충돌 시 보고. 필터 영역만 교체해 충돌면 최소화.
