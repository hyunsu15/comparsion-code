# 체크리스트 'NONE'(선택안함) 5번째 상태 — 설계

작성일: 2026-06-18

## 배경 / 목표

체크리스트 점검 상태는 4값(YES/NO/NA/HOLD). 한 번도 정하지 않은 항목은 **check_list 행이 없어** LEFT JOIN에서 `null`로 오고, FE가 `?? 'HOLD'`로 덮어 **'판단 보류'로 표시**된다. → "한 번도 안 본 항목"과 "명시적 보류"가 구분 안 됨.

**목표:** `'NONE'`(선택안함)을 **저장 가능한 5번째 상태**로 추가하고, **미설정 항목의 기본값을 NONE**으로 한다. 사용자 결정(승인): NONE을 정식 enum 값으로(저장됨), 버튼 맨 앞, 중립 회색, 진행률에서 미판단 취급, DB DEFAULT도 NONE.

## 범위 (2개 레포)

- FE: `comparsionV2` (이 레포)
- BE: `comparsion-be` (`C:\Users\KOSCOM\Downloads\comparsion-be`)

## 변경 — Frontend (`comparsionV2/src`)

1. **`checklistStatus.ts`** (공유 SSOT):
   - `ChecklistStatus = 'NONE' | 'YES' | 'NO' | 'NA' | 'HOLD'`
   - `CHECKLIST_STATUSES = ['NONE','YES','NO','NA','HOLD']` (NONE 맨 앞 = 좌측 첫 버튼/기본)
   - `STATUS_LABEL.NONE = '선택안함'`
   - `STATUS_SOLID.NONE = 'bg-slate-200 text-slate-500'`, `STATUS_SOFT.NONE = 'bg-slate-50 text-slate-400'` (NA의 slate보다 옅게 "비어있음")
   - `isDecided = (s) => s !== 'HOLD' && s !== 'NONE'` (선택안함=미판단)
2. **`checklistService.ts`**: `mapItem` 의 `status ... ?? 'HOLD'` → `?? 'NONE'`. (타입은 ChecklistStatus 그대로, 이제 NONE 포함)
3. **`component/Checklist.tsx`** (편집 패널): 버튼은 `CHECKLIST_STATUSES.map`이라 **자동 5개**. 미설정 항목은 NONE → '선택안함' 버튼 강조. (구조 변경 없음)
4. **`ChecklistBoard.tsx`** (매트릭스): `row.statuses[id] ?? 'HOLD'` (4곳: filter DONE, openCard, decidedOf, 셀 렌더) → `?? 'NONE'`. 범례/필터는 CHECKLIST_STATUSES·isDecided로 자동 반영.

## 변경 — Backend (`comparsion-be`)

5. **`src/checklist/port/in/update-checklist.dto.ts`**: `status?: 'YES'|'NO'|'NA'|'HOLD'` → `... |'NONE'`.
6. **`src/checklist/checklist.service.ts`**: `VALID_STATUS = new Set(['YES','NO','NA','HOLD'])` → `+ 'NONE'`.
7. **`create.sql`** (`comparsion_check_list`):
   - `CONSTRAINT chk_check_list_status CHECK (status IN ('YES','NO','NA','HOLD'))` → `+ 'NONE'`
   - `status VARCHAR2(10) DEFAULT 'HOLD' NOT NULL` → `DEFAULT 'NONE'`
   - 컬럼 코멘트(상태 목록·기본값) 갱신.
8. **`insert.sql`**: 시드에 NONE 1건(데모, 선택). **`mock-checklist.repository.ts`**: mock 데이터/검증에 NONE 반영(있으면). **`checklist.service.spec.ts`**: VALID_STATUS 케이스에 NONE 정상 통과 추가.

## DB 운영 반영 (문서화)

실 오라클은 create.sql 재실행 대신:
```sql
ALTER TABLE comparsion_check_list DROP CONSTRAINT chk_check_list_status;
ALTER TABLE comparsion_check_list ADD CONSTRAINT chk_check_list_status CHECK (status IN ('YES','NO','NA','HOLD','NONE'));
ALTER TABLE comparsion_check_list MODIFY status DEFAULT 'NONE';
```
⚠️ Oracle 미설치 → SQL 구문 검증만(기존 정책과 동일).

## 검증

- FE: `npx vitest run` · `npx vite build` · `tsc --noEmit`(변경 파일 무에러)
- BE: `nest build`(타입). jest는 pre-existing 환경 이슈로 실행 불가 → build로 타입 보장.
- 브라우저: 편집 패널 5버튼·미설정 항목 '선택안함' 표시, 매트릭스 NONE 배지·진행률 미판단 반영.

## 외부 API 변경

- `PATCH .../checklist/:checkPointId` 의 `status` 허용값에 `'NONE'` 추가(확장, 하위호환). `GET` 응답에 NONE 등장 가능.
- 운영 DB는 위 ALTER 필요.

## 가이드 준수

코딩(strict 타입·안쓰는 코드 정리), 리팩토링(기존 public 시그니처 보존·확장만), 테스트(BE VALID 케이스), 작업 후 docs/한일 기록.

## ⚠️ 동시 편집 주의

`Checklist.tsx`·`ChecklistBoard.tsx`·`checklistStatus.ts`가 동시 세션에서 편집 중일 수 있음 → 각 파일 편집 직전 최신 상태 재확인. 충돌 시 사용자에게 보고.
