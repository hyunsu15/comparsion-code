1. 필요한 데이터만 응답하기

응답 크기가 커질수록:

네트워크 비용 증가
직렬화/역직렬화 비용 증가
프론트 렌더링 비용 증가
안좋은 예
{
  "id": 1,
  "name": "Kim",
  "createdAt": "...",
  "updatedAt": "...",
  "deleted": false,
  "internalCode": "A001",
  "debugInfo": "...",
  "profileImageBinary": "..."
}
좋은 예
{
  "id": 1,
  "name": "Kim"
}
권장 방식
DTO 분리
화면별 응답 모델 사용
내부 컬럼 숨기기

2. N+1 문제 방지
문제 상황

게시글 100개 조회 후 작성자 조회를 100번 추가 수행

게시글 조회 1번
작성자 조회 100번

해결 방법
JOIN FETCH
batch size
projection 사용
필요한 경우에만 Lazy Loading
예시
SELECT p.*, u.*
FROM post p
JOIN user u ON p.user_id = u.id

페이지네이션 적용

대량 데이터 전체 조회 금지.

안좋은 예
GET /posts
좋은 예
GET /posts?page=1&size=20
추가 권장
최대 size 제한
무한 스크롤이면 cursor pagination 고려
Cursor Pagination 예시
GET /posts?cursor=120

4. 응답 압축 사용

HTTP 압축 사용.

gzip / brotli 활성화
JSON 응답 크기 감소
API 응답 시간 개선
일반적으로 효과 큰 경우
리스트 응답
긴 JSON
반복 문자열 많은 경우

7. API 응답 시간 기준 정하기

권장 기준 예시:

API 유형	목표 응답 시간
단순 조회	100ms 이하
일반 목록 조회	300ms 이하
복잡한 통계	1초 이하
측정 필수
평균 응답 시간
P95
P99
TPS

9. 데이터베이스 조회 최적화

응답 느림의 대부분은 DB 문제.

체크리스트
인덱스 존재 여부
Full Scan 발생 여부
정렬 컬럼 인덱스 여부
LIKE '%keyword%' 사용 여부
불필요한 DISTINCT 여부
반드시 확인
EXPLAIN PLAN

11. 프론트 요구사항 기준으로 API 설계

백엔드 중심 설계보다 화면 기준 설계가 응답 최적화에 유리함.

안좋은 방식
범용 API 하나로 모든 화면 처리
좋은 방식
화면 전용 API
필요한 데이터만 응답