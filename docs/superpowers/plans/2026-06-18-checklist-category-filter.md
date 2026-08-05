# 체크리스트 모아보기 유형·업무 필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 체크리스트 모아보기(매트릭스 탭)에 유형(big_category)·업무(middle_category) 드롭다운 필터를 추가한다.

**Architecture:** 프론트 전용. 매트릭스 데이터에 이미 있는 분류로 순수 함수(`checklistCategoryFilter.ts`)가 옵션 도출/행 필터/평균 진행률을 계산하고, `ChecklistBoard`가 드롭다운 2개 + 기존 필터와 AND 결합 + 요약 한 줄로 소비한다. 백엔드/API 변경 없음.

**Tech Stack:** Vite/React 19, vitest. 기존 `checklistService`(매트릭스 타입), `checklistStatus`(`isDecided`), `config/categoryOrder`(`sortBigCategories`) 재사용.

## Global Constraints

- **프론트(`comparsionV2`)만 수정. 백엔드·매트릭스 API 불변.** 명령은 `C:\Users\KOSCOM\Downloads\comparsionV2` 에서.
- **커밋하지 않는다(워킹트리 변경만)** — 이번 세션 사용자 선호. 각 태스크 끝 "커밋" 대신 변경을 그대로 둔다. 검증이 게이트.
- 순수 함수만 단위 테스트(vitest, `test/`). 컴포넌트는 `vite build` + 프리뷰로 검증(컴포넌트 테스트 인프라 없음 — 기존 관례).
- `ChecklistStatus = 'NONE'|'YES'|'NO'|'NA'|'HOLD'`. `isDecided(s) = s!=='HOLD' && s!=='NONE'`(YES/NO/NA만 판단완료). 누락 상태 기본값 `'HOLD'`(기존 `decidedOf`와 동일).
- 유형 옵션은 `sortBigCategories`로 정렬, 업무는 데이터(입력) 순서. null/빈 분류는 옵션에서 제외. 빈 문자열 `''` = '전체'(제약 없음).
- 들여쓰기 3단계 이하, Guard Clause, `as any`/새 `as unknown as` 금지, 안 쓰는 import 정리.

---

### Task 1: 순수 필터 모듈 `checklistCategoryFilter.ts` + 테스트

**Files:**
- Create: `comparsionV2/src/checklistCategoryFilter.ts`
- Test (create): `comparsionV2/test/checklistCategoryFilter.test.ts`

**Interfaces:**
- Consumes: `ChecklistMatrixRow`/`ChecklistMatrixColumn`(`./checklistService`), `isDecided`(`./checklistStatus`), `sortBigCategories`(`./config/categoryOrder`).
- Produces:
  - `deriveTypeOptions(rows: ChecklistMatrixRow[]): string[]`
  - `deriveWorkOptions(rows: ChecklistMatrixRow[], selectedType: string): string[]`
  - `matchesCategory(row: ChecklistMatrixRow, selectedType: string, selectedWork: string): boolean`
  - `averageProgress(rows: ChecklistMatrixRow[], columns: ChecklistMatrixColumn[]): number`

- [ ] **Step 1: 실패 테스트 작성**

Create `comparsionV2/test/checklistCategoryFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveTypeOptions, deriveWorkOptions, matchesCategory, averageProgress } from '../src/checklistCategoryFilter';
import type { ChecklistMatrixRow, ChecklistMatrixColumn } from '../src/checklistService';

const cols: ChecklistMatrixColumn[] = [
  { check_point_id: 1, check_point: 'C1', detail: null },
  { check_point_id: 2, check_point: 'C2', detail: null },
];

// a: 회원/인증 decided 2/2 · b: 계좌/이체 1/2 · c: 계좌/신규 0/2 · d: null/null 2/2
const rows: ChecklistMatrixRow[] = [
  { service_id: 'a', big_category: '회원', middle_category: '인증', statuses: { 1: 'YES', 2: 'NO' }, comments: {} },
  { service_id: 'b', big_category: '계좌', middle_category: '이체', statuses: { 1: 'YES', 2: 'HOLD' }, comments: {} },
  { service_id: 'c', big_category: '계좌', middle_category: '신규', statuses: {}, comments: {} },
  { service_id: 'd', big_category: null, middle_category: null, statuses: { 1: 'NA', 2: 'YES' }, comments: {} },
];

describe('deriveTypeOptions', () => {
  it('distinct 유형을 sortBigCategories 순서로, null 제외', () => {
    expect(deriveTypeOptions(rows)).toEqual(['회원', '계좌']); // BIG_CATEGORY_ORDER: 회원 < 계좌
  });
  it('빈 입력 → []', () => {
    expect(deriveTypeOptions([])).toEqual([]);
  });
});

describe('deriveWorkOptions', () => {
  it('유형 미선택이면 전 행의 업무 distinct(입력 순서)', () => {
    expect(deriveWorkOptions(rows, '')).toEqual(['인증', '이체', '신규']);
  });
  it('유형 선택 시 그 유형의 업무만', () => {
    expect(deriveWorkOptions(rows, '계좌')).toEqual(['이체', '신규']);
    expect(deriveWorkOptions(rows, '회원')).toEqual(['인증']);
  });
});

describe('matchesCategory', () => {
  it('둘 다 전체면 항상 true', () => {
    expect(matchesCategory(rows[0], '', '')).toBe(true);
  });
  it('유형만', () => {
    expect(matchesCategory(rows[0], '회원', '')).toBe(true);
    expect(matchesCategory(rows[0], '계좌', '')).toBe(false);
  });
  it('업무만(유형 독립)', () => {
    expect(matchesCategory(rows[0], '', '인증')).toBe(true);
    expect(matchesCategory(rows[0], '', '이체')).toBe(false);
  });
  it('유형+업무', () => {
    expect(matchesCategory(rows[1], '계좌', '이체')).toBe(true);
    expect(matchesCategory(rows[1], '계좌', '신규')).toBe(false);
  });
});

describe('averageProgress', () => {
  it('빈 rows → 0', () => { expect(averageProgress([], cols)).toBe(0); });
  it('빈 columns → 0', () => { expect(averageProgress(rows, [])).toBe(0); });
  it('a,b,c 평균 (1.0+0.5+0)/3 → 50', () => {
    expect(averageProgress([rows[0], rows[1], rows[2]], cols)).toBe(50);
  });
  it('a,d 평균 (1.0+1.0)/2 → 100 (NA/YES는 판단완료)', () => {
    expect(averageProgress([rows[0], rows[3]], cols)).toBe(100);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run test/checklistCategoryFilter.test.ts`
Expected: FAIL — 모듈 `../src/checklistCategoryFilter` 없음.

- [ ] **Step 3: 구현 작성**

Create `comparsionV2/src/checklistCategoryFilter.ts`:

```ts
import type { ChecklistMatrixRow, ChecklistMatrixColumn } from './checklistService';
import { isDecided } from './checklistStatus';
import { sortBigCategories } from './config/categoryOrder';

/** 행들의 distinct 유형(big_category) — sortBigCategories 순서. null/빈값 제외. */
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

/** 필터된 행들의 평균 진행률(%) = mean(decided/total). 행/열 0개면 0. 반올림 정수. */
export const averageProgress = (rows: ChecklistMatrixRow[], columns: ChecklistMatrixColumn[]): number => {
  if (rows.length === 0 || columns.length === 0) return 0;
  const sum = rows.reduce((acc, row) => {
    const decided = columns.filter((c) => isDecided(row.statuses[c.check_point_id] ?? 'HOLD')).length;
    return acc + decided / columns.length;
  }, 0);
  return Math.round((sum / rows.length) * 100);
};
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run test/checklistCategoryFilter.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: 커밋하지 않음** — 변경을 워킹트리에 그대로 둔다.

---

### Task 2: `ChecklistBoard.tsx` 에 유형·업무 드롭다운 + 요약 결합

**Files:**
- Modify: `comparsionV2/src/ChecklistBoard.tsx`

**Interfaces:**
- Consumes: Task 1의 `deriveTypeOptions`/`deriveWorkOptions`/`matchesCategory`/`averageProgress`.
- Produces: UI 동작만(외부 시그니처 없음).

- [ ] **Step 1: import 추가**

`ChecklistBoard.tsx` 상단 import 영역에 추가:

```ts
import { deriveTypeOptions, deriveWorkOptions, matchesCategory, averageProgress } from './checklistCategoryFilter';
```

- [ ] **Step 2: 상태 추가**

`const [card, setCard] = useState<CardData | null>(null);` **바로 아래**에 추가:

```ts
  const [selectedType, setSelectedType] = useState(''); // 유형(big_category), '' = 전체
  const [selectedWork, setSelectedWork] = useState(''); // 업무(middle_category), '' = 전체
```

- [ ] **Step 3: 옵션 도출 + filteredRows에 분류 필터 결합**

`const { columns, rows } = matrix;` **바로 아래**에 추가:

```ts
  const typeOptions = useMemo(() => deriveTypeOptions(rows), [rows]);
  const workOptions = useMemo(() => deriveWorkOptions(rows, selectedType), [rows, selectedType]);
```

기존 `filteredRows` useMemo의 콜백 안, `if (q) { ... }` 블록 **위**에 분류 필터를 추가하고, deps 배열에 `selectedType, selectedWork`를 추가한다. 결과 형태:

```ts
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesCategory(row, selectedType, selectedWork)) return false;
      if (q) {
        const hay = `${row.service_id} ${row.big_category ?? ''} ${row.middle_category ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (commentOnly && Object.keys(row.comments).length === 0) return false;
      if (statusFilter === 'NO' && !columns.some((c) => row.statuses[c.check_point_id] === 'NO')) return false;
      if (statusFilter === 'HOLD' && !columns.some((c) => row.statuses[c.check_point_id] === 'HOLD')) return false;
      if (statusFilter === 'DONE' && !columns.every((c) => isDecided(row.statuses[c.check_point_id] ?? 'HOLD'))) return false;
      return true;
    });
  }, [rows, columns, search, commentOnly, statusFilter, selectedType, selectedWork]);
```

- [ ] **Step 4: 유형 변경 핸들러(업무 캐스케이드 리셋)**

`filteredRows` 정의 아래(또는 `rowVirtualizer` 위)에 추가:

```ts
  // 유형 변경 시, 새 유형에 현재 업무가 없으면 업무를 전체로 되돌린다.
  const onTypeChange = (v: string) => {
    setSelectedType(v);
    if (selectedWork && !deriveWorkOptions(rows, v).includes(selectedWork)) setSelectedWork('');
  };
```

- [ ] **Step 5: 필터바에 드롭다운 2개 추가**

필터바의 상태 필터 `<div className="flex items-center rounded-xl border ...">...</div>` **바로 앞**(검색 input 다음)에 추가:

```tsx
        <select
          value={selectedType}
          onChange={(e) => onTypeChange(e.target.value)}
          aria-label="유형 선택"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        >
          <option value="">유형 전체</option>
          {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={selectedWork}
          onChange={(e) => setSelectedWork(e.target.value)}
          aria-label="업무 선택"
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        >
          <option value="">업무 전체</option>
          {workOptions.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
```

- [ ] **Step 6: 요약 한 줄(평균 진행률) 결합**

기존 카운트 span을 교체:

```tsx
        <span className="text-[12px] font-bold text-slate-400 tabular-nums">{filteredRows.length} / {rows.length} 프로그램 · 평균 진행률 {averageProgress(filteredRows, columns)}%</span>
```

- [ ] **Step 7: 빌드 확인**

Run: `npx vite build`
Expected: 성공(에러 0). 실패 시 편집 지점 재점검.

- [ ] **Step 8: 커밋하지 않음** — 워킹트리에 그대로 둔다. (런타임/프리뷰 검증은 컨트롤러가 Task 3에서 수행.)

---

### Task 3: 한일 기록 + 최종 검증

**Files:**
- Modify: `comparsionV2/docs/한일/2026-06-18.md`

- [ ] **Step 1: 최종 검증**

Run: `npx vitest run test/checklistCategoryFilter.test.ts` → PASS (10)
Run: `npx vitest run` → 전체 FE 테스트 그린(회귀 없음)
Run: `npx vite build` → 성공

- [ ] **Step 2: 프리뷰 수동 검증(컨트롤러)**

BE mock(`:50004`) 가동 상태에서 dev 서버 → 체크리스트 모아보기 탭:
- `유형`·`업무` 드롭다운 노출, 유형 선택 시 행 좁혀짐 + 업무 옵션 캐스케이드, 요약 `평균 진행률 N%` 갱신, 유형 변경 시 호환 안 되는 업무 리셋 확인.

- [ ] **Step 3: 한일 기록**

`comparsionV2/docs/한일/2026-06-18.md` 맨 아래에 append:

```markdown
## 체크리스트 모아보기 — 유형·업무 필터 (사용자 요청)
- 매트릭스 탭에 유형(big_category)·업무(middle_category) 드롭다운 필터 추가(캐스케이드, 업무 단독 선택 허용). 기존 검색·상태·의견 필터와 AND. 현재 범위 '평균 진행률 N%' 요약 추가.
- 순수 로직은 신규 `src/checklistCategoryFilter.ts`(deriveTypeOptions/deriveWorkOptions/matchesCategory/averageProgress) + vitest 10건. ChecklistBoard 는 드롭다운 2개·필터 결합만.
- **외부 API 변경 없음**(getMatrix가 분류 제공). FE only. vite build OK, 프리뷰 확인.
```

- [ ] **Step 4: 커밋하지 않음**

---

## Self-Review

**1. Spec coverage**
- 유형·업무 드롭다운(캐스케이드, 단독 선택) → Task 2 Step 5 + Task 1 derive*. ✓
- 기존 필터와 AND → Task 2 Step 3. ✓
- 유형 변경 시 업무 리셋 → Task 2 Step 4. ✓
- 요약(평균 진행률) → Task 1 averageProgress + Task 2 Step 6. ✓
- 순수 함수 테스트 → Task 1. ✓
- 백엔드 불변 → 변경 파일에 BE 없음. ✓
- 한일 기록(외부 API 변경 없음 명시) → Task 3. ✓

**2. Placeholder scan**: TBD/TODO/"적절히" 없음. 모든 코드 스텝에 실제 코드. ✓

**3. Type consistency**
- `deriveTypeOptions/deriveWorkOptions/matchesCategory/averageProgress` 시그니처가 Task 1 정의 ↔ Task 2 사용에서 일치. ✓
- `ChecklistMatrixRow.statuses: Record<number, ChecklistStatus>` — 테스트 fixture 의 `{1:'YES'}` 가 타입에 부합(배열을 `ChecklistMatrixRow[]`로 명시 annotate). ✓
- `averageProgress` 의 `row.statuses[id] ?? 'HOLD'` + `isDecided` 가 ChecklistBoard `decidedOf`(line 111-112)와 동일 규칙. ✓
- `sortBigCategories` 순서(회원<계좌) → 테스트 기대값 `['회원','계좌']` 일치. ✓
