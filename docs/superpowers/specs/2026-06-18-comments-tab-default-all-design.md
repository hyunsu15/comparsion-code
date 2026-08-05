# 의견 모아보기 탭 — 첫 진입 시 자동 '전체 모아보기' — 설계

작성일: 2026-06-18

## 배경 / 목표

`체크리스트 모아보기` 탭은 열면 매트릭스가 바로 보이는데, `의견 모아보기` 탭은 "프로그램을 선택하세요" 빈 화면 → '전체 모아보기' 버튼을 한 번 더 눌러야 전체가 보인다(2스텝). 두 '모아보기' 탭의 동작이 달라 불편(귀찮음).

**목표:** 의견 모아보기 탭을 **처음 열면 자동으로 '전체(글로벌) 모아보기'** 가 뜨게 해 체크리스트 모아보기와 동일한 "탭 1클릭 즉시" 경험을 준다. (사용자 결정: 옵션 ①, 다듬은 버전)

## 동작 (확정)

1. **첫 활성화 시 자동 전체**: 의견 모아보기 탭이 처음 활성화될 때, 사용자가 아무것도 선택하지 않았으면(프로그램·즐겨찾기·전체 모드 모두 off) `allMode`를 켜 전체(글로벌) 1페이지를 로드.
2. **세션 내 상태 보존**: 자동 전환은 **1회만**. 이후 프로그램 드릴다운/즐겨찾기/필터 등 사용자의 선택은 탭을 오갔다 와도 유지(매번 전체로 되돌리지 않음).
3. **'전체 모아보기' 버튼 유지**: 좁혀 본 뒤 전체로 되돌아가는 명시적 출구로 그대로 둔다.
4. **업무 전체**: allMode가 켜진 상태에서 업무(중분류) 선택 시 그 업무로 즉시 재스코프(기존 동작) → "업무 전체"는 탭→업무선택 2클릭.

## 변경 (FE only, `comparsionV2`)

- **`App.tsx`**: `<CommentBoard ... />` 에 `active={activeTab === 'comments'}` 전달 (ChecklistBoard 의 `active` 패턴과 동일).
- **`CommentBoard.tsx`**:
  - props 에 `active?: boolean` 추가(기본 false).
  - `useRef` import 추가, `didAutoAll = useRef(false)`.
  - 효과 추가: `active` 가 처음 true 가 될 때 1회, 아무것도 선택 안 했으면 `setAllMode(true)`. 기존 `[allMode, selectedBig, selectedMiddle, opinionFilter]` 효과가 1페이지 로드를 담당.
    ```tsx
    useEffect(() => {
      if (!active || didAutoAll.current) return;
      didAutoAll.current = true;
      if (!selectedProgram && !favMode && !allMode) setAllMode(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);
    ```

## 비목표 / 향후

- 직전 스코프 기억(옵션 ②)·새 탭(옵션 ③)은 채택 안 함(예측 불가/내비 중복). 추후 옵션으로 검토 가능.

## 검증

- `vite build` · `tsc --noEmit`(변경 파일 무에러) · `vitest`(기존 그린 유지). 백엔드 필요한 동작이라 브라우저 풀 플로우는 BE 기동 시 확인(탭 열면 전체 자동 로드).
- 외부 API 변경: 없음(기존 `getThreadsPaged` 그대로, 트리거 시점만 변경).

## ⚠️ 동시 편집 주의

`CommentBoard.tsx`는 동시 세션이 방금 전체 모아보기/페이징을 추가한 파일 → 편집 직전 최신본 재확인, 충돌 시 보고.
