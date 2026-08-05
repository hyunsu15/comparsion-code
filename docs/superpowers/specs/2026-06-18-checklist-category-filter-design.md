# 체크리스트 모아보기 — 유형·업무 필터 설계

- 작성일: 2026-06-18
- 대상: 프론트 `comparsionV2` only (백엔드 변경 없음)
- 관련 파일: `src/ChecklistBoard.tsx`, (신규) `src/checklistCategoryFilter.ts`

## 1. 배경 / 문제

**체크리스트 모아보기** 탭([ChecklistBoard.tsx](../../../src/ChecklistBoard.tsx))은 전 프로그램 × 점검항목 상태 매트릭스다. 각 행(프로그램)은 이미 `big_category`(유형)·`middle_category`(업무)를 데이터로 갖고 있으나, 현재 이를 **자유 텍스트 검색**으로만 거를 수 있다. 유형/업무를 정확히 골라 보는 UI가 없다.

요청: 유형(대분류: 회원/계좌…)·업무(중분류: 인증/이체…)별로 골라 보는 기능. UX 판단으로 **드롭다운 필터** 방식 채택(그룹 보기는 가로 스크롤 매트릭스와 상성이 나빠 제외).

백엔드 `GET /checklist/matrix`(`checklistService.getMatrix`)가 이미 행마다 `big_category`/`middle_category`를 내려주므로 **프론트만으로** 구현 가능하다.

## 2. 목표

- 필터바에 `유형`·`업무` 드롭다운 추가, 매트릭스 행을 분류로 좁힌다.
- 기존 검색·상태·의견 필터와 AND 조합.
- 현재 좁혀진 범위의 요약 한 줄(프로그램 수 + 평균 진행률).

### 비목표 (YAGNI)
- 그룹 보기/소계 행, 백엔드·매트릭스 API 변경, 소스 비교 체크리스트 패널 변경.

## 3. 동작 / UX

- 필터바(기존 검색/상태/의견 옆)에 `유형`·`업무` `<select>` 2개. 소스 비교 탭의 유형/업무 셀렉트와 동일한 톤.
- **유형 옵션**: 매트릭스 `rows`의 distinct `big_category`(null/빈값 제외)를 `sortBigCategories`로 정렬 + 맨 앞 `전체`(value `''`).
- **업무 옵션**: 선택된 유형에 속한 행들의 distinct `middle_category`(유형 미선택이면 전 행) + 맨 앞 `전체`. 정렬은 데이터(입력) 순서(소스 비교 탭의 중분류와 동일 방식).
- **캐스케이드 리셋**: 유형을 바꿨을 때 현재 선택된 업무가 새 유형의 업무 목록에 없으면 업무를 `전체`로 되돌린다.
- **독립 선택 허용**: 유형=전체로 두고 업무만 고를 수 있다(그 업무를 가진 전 유형 프로그램이 보인다). 업무명이 유형 간 중복되면 모두 포함된다(의도된 동작).
- **요약 한 줄**: 기존 `{filteredRows.length} / {rows.length} 프로그램` 표기에 `· 평균 진행률 N%`를 덧붙인다. 평균 = 필터된 각 행의 `decided/total` 평균(행 0개면 0%).

## 4. 설계

### 4.1 신규 순수 모듈 `src/checklistCategoryFilter.ts`

매트릭스 타입(`ChecklistMatrixRow`, `ChecklistMatrixColumn`)은 `checklistService`에서, `isDecided`는 `checklistStatus`에서 import.

```ts
import type { ChecklistMatrixRow, ChecklistMatrixColumn } from './checklistService';
import { isDecided } from './checklistStatus';
import { sortBigCategories } from './config/categoryOrder';

/** 행들의 distinct 유형(big_category) — 정의 순서로 정렬. null/빈값 제외. */
export const deriveTypeOptions = (rows: ChecklistMatrixRow[]): string[] => {
  const set = new Set<string>();
  for (const r of rows) if (r.big_category) set.add(r.big_category);
  return sortBigCategories(Array.from(set));
};

/** 선택 유형 안의 distinct 업무(middle_category). 유형 미선택('')이면 전 행. 데이터 순서. */
export const deriveWorkOptions = (rows: ChecklistMatrixRow[], selectedType: string): string[] => {
  const set = new Set<string>();
  for (const r of rows) {
    if (selectedType && r.big_category !== selectedType) continue;
    if (r.middle_category) set.add(r.middle_category);
  }
  return Array.from(set);
};

/** 행이 현재 유형/업무 선택에 부합하는지. 빈 문자열은 '전체'(제약 없음). */
export const matchesCategory = (row: ChecklistMatrixRow, selectedType: string, selectedWork: string): boolean => {
  if (selectedType && row.big_category !== selectedType) return false;
  if (selectedWork && row.middle_category !== selectedWork) return false;
  return true;
};

/** 필터된 행들의 평균 진행률(%) = mean(decided/total). 행 0개 또는 열 0개면 0. 반올림 정수. */
export const averageProgress = (rows: ChecklistMatrixRow[], columns: ChecklistMatrixColumn[]): number => {
  if (rows.length === 0 || columns.length === 0) return 0;
  const sum = rows.reduce((acc, row) => {
    const decided = columns.filter((c) => isDecided(row.statuses[c.check_point_id] ?? 'HOLD')).length;
    return acc + decided / columns.length;
  }, 0);
  return Math.round((sum / rows.length) * 100);
};
```

### 4.2 `ChecklistBoard.tsx` 변경

- 상태 추가: `const [selectedType, setSelectedType] = useState('')`, `const [selectedWork, setSelectedWork] = useState('')`.
- 옵션 useMemo: `typeOptions = deriveTypeOptions(rows)`, `workOptions = deriveWorkOptions(rows, selectedType)`.
- `filteredRows`의 기존 useMemo에 `if (!matchesCategory(row, selectedType, selectedWork)) return false;` 추가. deps에 `selectedType, selectedWork` 포함.
- 유형 select onChange: `setSelectedType(v)` + 새 유형의 workOptions에 현재 업무가 없으면 `setSelectedWork('')`.
- 업무 select onChange: `setSelectedWork(v)`.
- 필터바에 `<select>` 2개(유형/업무) 추가. 업무 select는 `workOptions` 길이 0이거나(선택 유형에 업무 없음) 항상 노출하되 옵션만 갱신.
- 요약: 기존 카운트 옆에 `· 평균 진행률 {averageProgress(filteredRows, columns)}%` 추가.

## 5. 테스트 (vitest, `test/checklistCategoryFilter.test.ts`)

순수 함수만 검증(컴포넌트 단위테스트 인프라 없음 — 기존 관례).

- `deriveTypeOptions`: distinct, `sortBigCategories` 순서(회원→계좌→서비스→기타), null/빈 `big_category` 제외, 빈 입력 → `[]`.
- `deriveWorkOptions`: 유형 미선택('') → 전 행 업무 distinct; 유형 선택 → 그 유형 업무만; null `middle_category` 제외.
- `matchesCategory`: 유형만/업무만/둘 다/둘 다 빈값(전체) 케이스, 불일치 false.
- `averageProgress`: 빈 rows → 0, 빈 columns → 0, 혼합 상태 평균 반올림(경계값).

## 6. 검증 / 마무리

- FE: `npx vite build` OK, `npx vitest run test/checklistCategoryFilter.test.ts`(+회귀) 통과.
- 프리뷰: 체크리스트 모아보기 탭에서 유형/업무 드롭다운 동작(좁혀짐·캐스케이드 리셋·요약 갱신) 확인.
- 작업 후 `docs/한일/2026-06-18.md` 기록(외부 API 변경 없음 명시).
