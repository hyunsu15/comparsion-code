# Apple Style UI Guide

## 1. Design Principles

### Clarity

* 콘텐츠가 가장 중요하다.
* UI는 콘텐츠를 방해하지 않는다.
* 텍스트는 읽기 쉬워야 한다.
* 아이콘은 의미를 명확하게 전달해야 한다.

### Deference

* UI는 사용자 경험을 돕는 역할만 한다.
* 과도한 장식 요소를 사용하지 않는다.
* 콘텐츠를 중심으로 배치한다.

### Depth

* 계층 구조를 명확하게 표현한다.
* 적절한 그림자와 애니메이션을 사용한다.
* 사용자의 위치와 이동 경로를 이해할 수 있게 한다.

---

## 2. Layout

### Grid System

* 기본 여백 단위: 8pt
* 컴포넌트 간격:

  * Small: 8px
  * Medium: 16px
  * Large: 24px
  * Extra Large: 32px

### Container

```css
max-width: 1200px;
padding: 24px;
margin: 0 auto;
```

### Safe Area

* 화면 가장자리에 요소를 붙이지 않는다.
* 최소 16px 이상의 여백을 유지한다.

---

## 3. Typography

### Font

우선순위

```text
SF Pro Display
SF Pro Text
system-ui
sans-serif
```

### Heading

| Type | Size | Weight |
| ---- | ---- | ------ |
| H1   | 34px | 700    |
| H2   | 28px | 700    |
| H3   | 22px | 600    |
| H4   | 20px | 600    |

### Body

| Type    | Size |
| ------- | ---- |
| Large   | 17px |
| Body    | 15px |
| Small   | 13px |
| Caption | 12px |

### Rules

* 줄 길이 60~80자 권장
* 행간 1.4~1.6
* 불필요한 Bold 남용 금지

---

## 4. Colors

### Primary

```css
#007AFF
```

### Success

```css
#34C759
```

### Warning

```css
#FF9500
```

### Error

```css
#FF3B30
```

### Gray Scale

```css
#F2F2F7
#E5E5EA
#D1D1D6
#8E8E93
#3A3A3C
#1C1C1E
```

### Rules

* 의미 없는 색상 사용 금지
* 상태 표현에만 강조 색상 사용
* 다크모드 지원 필수

---

## 5. Buttons

### Primary Button

```css
height: 44px;
padding: 0 16px;
border-radius: 12px;
```

### Secondary Button

```css
background: transparent;
border: none;
```

### Rules

* 최소 터치 영역 44x44
* 버튼 개수 최소화
* 주요 액션은 화면당 1개

---

## 6. Cards

```css
border-radius: 16px;
padding: 16px;
background: white;
```

### Shadow

```css
box-shadow:
0 2px 8px rgba(0,0,0,0.08);
```

### Rules

* 카드 중첩 최소화
* 필요할 때만 그림자 사용

---

## 7. Navigation

### Navigation Bar

```css
height: 52px;
```

구성

* Back
* Title
* Action

### Rules

* 현재 위치가 명확해야 함
* 한 화면에 주요 액션 1개

---

## 8. Lists

### Item Height

```css
44px ~ 56px
```

### Rules

* 시각적 구분선 최소화
* 여백으로 구분
* 스캔하기 쉽게 구성

---

## 9. Forms

### Input

```css
height: 44px;
border-radius: 10px;
padding: 0 12px;
```

### Rules

* 필수 입력 최소화
* 실시간 검증 제공
* 오류 메시지는 입력창 아래 표시

---

## 10. Animations

### Duration

| Type   | Duration |
| ------ | -------- |
| Fast   | 150ms    |
| Normal | 250ms    |
| Slow   | 350ms    |

### Easing

```css
cubic-bezier(0.4, 0, 0.2, 1)
```

### Rules

* 기능 설명용 애니메이션 금지
* 상태 변화만 표현
* 빠르고 자연스럽게

---

## 11. Icons

* SF Symbols 사용 권장
* 20~24px 기준
* 텍스트 없이 의미 전달 가능해야 함

---

## 12. Accessibility

### Contrast

* 최소 WCAG AA 준수

### Touch Target

```css
44px × 44px 이상
```

### Support

* VoiceOver
* Dynamic Type
* Keyboard Navigation

---

## 13. Dark Mode

### Rules

* Pure Black 사용 지양
* 계층에 따라 명도 차이 제공

예시

```css
Background: #000000
Surface: #1C1C1E
Secondary Surface: #2C2C2E
```

---

## 14. Developer Checklist

### Layout

* [ ] 8pt Grid 사용
* [ ] Safe Area 확보
* [ ] Responsive 대응

### Typography

* [ ] 최대 4단계 Heading
* [ ] 읽기 쉬운 행간

### Components

* [ ] 최소 터치 영역 44px
* [ ] 일관된 Radius 사용

### Accessibility

* [ ] 키보드 조작 가능
* [ ] 스크린 리더 지원
* [ ] 명암비 검증 완료

### Performance

* [ ] 60fps 애니메이션
* [ ] 불필요한 렌더링 제거
* [ ] 이미지 최적화
* [ ] Lazy Loading 적용
