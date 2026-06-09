# REST API URL 설계 규칙

## 1. 기본 원칙

* URL은 **리소스(Resource, 자원)** 중심으로 설계한다.
* URL에는 동사보다 명사를 사용한다.
* 행위(Create, Read, Update, Delete)는 HTTP Method로 표현한다.
* URL 규칙은 프로젝트 전체에서 일관성을 유지한다.

---

# 2. 기본 URL 구조

```text
/resources
/resources/{id}
/resources/{id}/sub-resources
```

예시:

```text
/users
/users/1
/users/1/orders
/orders/100
```

---

# 3. HTTP Method 사용 규칙

| 기능    | Method | URL           |
| ----- | ------ | ------------- |
| 목록 조회 | GET    | `/users`      |
| 단건 조회 | GET    | `/users/{id}` |
| 생성    | POST   | `/users`      |
| 전체 수정 | PUT    | `/users/{id}` |
| 부분 수정 | PATCH  | `/users/{id}` |
| 삭제    | DELETE | `/users/{id}` |

---

# 4. URL 네이밍 규칙

## 4-1. 복수형 사용

```text
/users
/orders
/products
```

권장:

* 복수형 리소스명 사용

비권장:

```text
/user
/order
```

---

## 4-2. 동사 사용 금지

비권장:

```text
/getUsers
/createOrder
/deleteTask
```

권장:

```text
GET /users
POST /orders
DELETE /tasks/{id}
```

---

## 4-3. kebab-case 사용

권장:

```text
/task-cases
/scenario-runs
/order-items
```

비권장:

```text
/task_cases
/scenarioRuns
```

---

# 5. 계층 구조 표현

리소스 간 소속 관계가 있으면 URL 계층으로 표현한다.

예시:

```text
/users/{userId}/orders
/projects/{projectId}/tasks
/tasks/{taskId}/comments
```

---

# 6. 검색/필터/정렬은 Query Parameter 사용

## 검색

```text
/users?name=kim
```

## 페이징

```text
/users?page=1&size=20
```

## 정렬

```text
/products?sort=price
```

## 복합 조건

```text
/orders?status=READY&page=2&size=50
```

---

# 7. 액션성 API 처리

REST만으로 표현이 어려운 경우 예외적으로 액션 사용 가능.

예시:

```text
POST /orders/{id}/cancel
POST /payments/{id}/refund
POST /scenarios/{id}/execute
```

---

# 8. 응답 구조 권장 예시

## 목록 조회

```json
{
  "items": [],
  "page": 1,
  "size": 20,
  "totalCount": 100
}
```

## 단건 조회

```json
{
  "id": 1,
  "name": "Task A"
}
```

---

# 9. 최종 권장 사항

* URL은 명사 중심으로 설계
* HTTP Method로 행위 표현
* URL 규칙 통일
* Query Parameter로 검색/필터 처리
* 계층 관계는 URL depth로 표현
* Action API는 최소한으로 사용
* 직관성과 예측 가능성을 우선시한다.
