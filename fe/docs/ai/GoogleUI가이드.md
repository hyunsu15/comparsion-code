# Google Style UI Guide (Material Design 3)

## 1. Design Principles

### Adaptive

* 다양한 기기 환경에 대응한다.
* 모바일, 태블릿, 데스크톱을 동일한 경험으로 연결한다.

### Expressive

* 브랜드와 사용자의 개성을 표현할 수 있다.
* 색상과 형태를 적극 활용한다.

### Accessible

* 누구나 쉽게 사용할 수 있어야 한다.
* 접근성을 기본 요구사항으로 간주한다.

---

# 2. Layout

## Grid System

기본 단위

```text
4dp Grid
```

주요 간격

| Size | Value |
| ---- | ----- |
| XS   | 4dp   |
| S    | 8dp   |
| M    | 16dp  |
| L    | 24dp  |
| XL   | 32dp  |
| XXL  | 48dp  |

---

## Responsive Breakpoints

| Device  | Width         |
| ------- | ------------- |
| Mobile  | < 600px       |
| Tablet  | 600px ~ 840px |
| Desktop | > 840px       |

---

# 3. Typography

## Font

우선순위

```text
Roboto
Google Sans
system-ui
sans-serif
```

---

## Type Scale

| Style          | Size |
| -------------- | ---- |
| Display Large  | 57px |
| Display Medium | 45px |
| Headline Large | 32px |
| Title Large    | 22px |
| Body Large     | 16px |
| Body Medium    | 14px |
| Label Large    | 14px |

---

## Rules

* 시각적 계층 구조 유지
* 5~7개 타입 스케일 이내 유지
* 지나친 Bold 사용 금지

---

# 4. Color System

## Primary

```css
#6750A4
```

## Secondary

```css
#625B71
```

## Tertiary

```css
#7D5260
```

## Error

```css
#B3261E
```

---

## Surface

```css
#FFFBFE
```

## Background

```css
#FFFFFF
```

---

## Rules

* Surface 기반 설계
* 색상은 의미 전달용
* 다크모드 필수 지원

---

# 5. Elevation

## Levels

| Level | Shadow   |
| ----- | -------- |
| 0     | 없음       |
| 1     | 약한 그림자   |
| 2     | 카드       |
| 3     | 드롭다운     |
| 4     | 모달       |
| 5     | 최상위 오버레이 |

---

## Example

```css
box-shadow:
0 1px 2px rgba(0,0,0,.12);
```

---

# 6. Buttons

## Filled Button

```css
height: 40px;
border-radius: 20px;
```

주요 액션

---

## Outlined Button

```css
border: 1px solid;
```

보조 액션

---

## Text Button

```css
background: none;
```

저우선순위 액션

---

## Rules

* 한 화면에 Primary CTA 1개
* 버튼 상태 표시 필수
* Hover / Focus 지원

---

# 7. Cards

## Standard Card

```css
border-radius: 12px;
padding: 16px;
```

---

## Rules

* 콘텐츠 그룹화 목적
* 카드 안에 카드 중첩 최소화

---

# 8. Navigation

## Top App Bar

```css
64px
```

---

## Navigation Rail

```css
72px
```

태블릿 이상 권장

---

## Navigation Drawer

```css
360px
```

대규모 메뉴

---

## Bottom Navigation

```css
80px
```

모바일 권장

---

# 9. Forms

## Text Field

```css
height: 56px;
border-radius: 4px;
```

---

## States

* Enabled
* Focused
* Disabled
* Error

모든 상태 정의 필수

---

## Validation

* 즉각적 피드백 제공
* 오류 해결 방법 표시

---

# 10. Motion

## Duration

| Type   | Time      |
| ------ | --------- |
| Short  | 100~200ms |
| Medium | 200~300ms |
| Long   | 300~500ms |

---

## Rules

* 상태 변화를 설명
* 위치 이동을 이해 가능하게
* 과도한 효과 금지

---

# 11. Shapes

## Radius

| Type        | Value |
| ----------- | ----- |
| Small       | 4px   |
| Medium      | 12px  |
| Large       | 16px  |
| Extra Large | 28px  |

---

# 12. Icons

## Material Symbols

기본 크기

```css
20px
24px
```

---

## Rules

* 텍스트 보조 역할
* 의미 명확성 우선

---

# 13. Accessibility

## Touch Target

```css
48px × 48px
```

---

## Contrast

```text
WCAG AA 이상
```

---

## Keyboard

* 모든 기능 접근 가능
* Focus 상태 표시

---

# 14. Dark Mode

## Surface

```css
#121212
```

---

## Surface Container

```css
#1E1E1E
```

---

## Rules

* 순수 검정보다 Surface 계층 사용
* 명도 차이로 구조 표현

---

# 15. Developer Checklist

## Layout

* [ ] 4dp Grid 사용
* [ ] 반응형 대응
* [ ] Breakpoint 적용

## Typography

* [ ] Material Type Scale 사용
* [ ] 일관된 계층 구조 유지

## Components

* [ ] Hover 지원
* [ ] Focus 지원
* [ ] Disabled 상태 제공

## Accessibility

* [ ] Touch Target 48dp
* [ ] Keyboard 접근 가능
* [ ] 스크린 리더 지원

## Performance

* [ ] 이미지 최적화
* [ ] Skeleton UI 제공
* [ ] Lazy Loading 적용
* [ ] 애니메이션 60fps 유지
