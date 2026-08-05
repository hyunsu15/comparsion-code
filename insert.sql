-- =====================================================================
-- 목(mock) 데이터 INSERT — create.sql 스키마 기준
--  - 전제: create.sql 의 5개 테이블이 먼저 생성되어 있어야 한다.
--  - id 컬럼은 GENERATED ALWAYS AS IDENTITY → 명시 INSERT 불가.
--    thread↔message FK 는 RETURNING id INTO 로, check_list↔check_point FK 는 교차곱 SELECT 로 연결한다.
--  - created_at / update_date 는 컬럼 DEFAULT(KST)를 쓰므로 INSERT 에서 생략.
--  - 체크리스트 모델: check_point(마스터: 제목 check_point + 세부문장 detail) + check_list(프로그램별 상태).
--  - 파일 인코딩 UTF-8. SQL*Plus/SQLcl 등 UTF-8 클라이언트로 실행.
--  - ⚠️ 맨 앞에서 기존 데이터를 모두 지운다(깨끗한 목 셋업). 운영 데이터에 절대 실행 금지.
-- =====================================================================

SET DEFINE OFF;
SET SQLBLANKLINES ON;

-- 0) 기존 데이터 정리 (FK 역순)
DELETE FROM comparsion_check_list;
DELETE FROM comparsion_check_point;
DELETE FROM comparsion_discussion_message;
DELETE FROM comparsion_discussion_thread;
DELETE FROM comparsion_services;
COMMIT;

-- 1) Services — 하나의 service_id 가 pb/pb5 두 행을 가진다.
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('a',       '회원', '인증',     'pb',  'gemini-code-1779930299661.pc');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('a',       '회원', '인증',     'pb5', 'EmpProcess.processEmployee');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('b',       '계좌', '이체',     'pb',  'gemini-code-1779930355226.pc');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('b',       '계좌', '이체',     'pb5', 'gemini-code-1779930335141.java');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('ACCT001', '계좌', '신규',     'pb',  'ACCT001.pc');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('ACCT001', '계좌', '신규',     'pb5', 'AcctService.java');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('ACCTMAP', '계좌', '쿼리매핑', 'pb',  'ACCT001.pc');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('ACCTMAP', '계좌', '쿼리매핑', 'pb5', 'AcctMapper.xml');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('ACCT002', '계좌', '잔액조회', 'pb',  'ACCT002');
INSERT INTO comparsion_services (service_id, big_category, middle_category, code_kind, file_name) VALUES ('ACCT002', '계좌', '잔액조회', 'pb5', 'AcctService.java');
COMMIT;

-- 2) Discussion threads + messages (A 포맷: 가장 오래된 메시지가 스레드 본문)
DECLARE
  v_tid NUMBER;
BEGIN
  -- Thread 1: service a, pb5 줄10 (마지막 메시지 리액션=확인중)
  INSERT INTO comparsion_discussion_thread (status, code_kind, service_id, location, opinion_type)
    VALUES ('CHECK_PB5', 'pb5', 'a', 10, 'MISMATCH') RETURNING id INTO v_tid;
  INSERT INTO comparsion_discussion_message (thread_id, writer_role, writer_name, content)
    VALUES (v_tid, 'pb5', '김피비오', '첫 토론 주제입니다.');
  INSERT INTO comparsion_discussion_message (thread_id, writer_role, writer_name, content, reaction)
    VALUES (v_tid, 'pb', '이피비', '네, 확인했습니다. 슬랙이랑 비슷하네요.', 'REVIEWING');
  -- Thread 2: service b, pb 줄25
  INSERT INTO comparsion_discussion_thread (status, code_kind, service_id, location, opinion_type)
    VALUES ('CHECK_PB', 'pb', 'b', 25, 'BUSINESS_CHECK') RETURNING id INTO v_tid;
  INSERT INTO comparsion_discussion_message (thread_id, writer_role, writer_name, content)
    VALUES (v_tid, 'pb', '이피비', '데이터 정합성 확인 요청');
  INSERT INTO comparsion_discussion_message (thread_id, writer_role, writer_name, content, reaction)
    VALUES (v_tid, 'pb5', '박오세대', 'status 를 어떻게 할까요?', 'SKIP');
  -- Thread 3: service a, pb5 줄5 (해결됨)
  INSERT INTO comparsion_discussion_thread (status, code_kind, service_id, location, resolved_at, opinion_type)
    VALUES ('RESOLVED', 'pb5', 'a', 5, CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS DATE), 'ETC') RETURNING id INTO v_tid;
  INSERT INTO comparsion_discussion_message (thread_id, writer_role, writer_name, content)
    VALUES (v_tid, 'pb5', '김피비오', '이미 해결된 쓰레드');
  -- Thread 4: service a, pb5 줄15 (메시지 리액션=조치완료)
  INSERT INTO comparsion_discussion_thread (status, code_kind, service_id, location, opinion_type)
    VALUES ('CHECK_PB5', 'pb5', 'a', 15, 'EXPLANATION') RETURNING id INTO v_tid;
  INSERT INTO comparsion_discussion_message (thread_id, writer_role, writer_name, content, reaction)
    VALUES (v_tid, 'pb5', '박오세대', 'PB5 검토 필요', 'DONE');
  -- Thread 5: service b, pb 줄30
  INSERT INTO comparsion_discussion_thread (status, code_kind, service_id, location, opinion_type)
    VALUES ('CHECK_PB5', 'pb', 'b', 30, 'OMISSION') RETURNING id INTO v_tid;
  INSERT INTO comparsion_discussion_message (thread_id, writer_role, writer_name, content)
    VALUES (v_tid, 'pb', '이피비', '연계 시스템 오류 보고');
  COMMIT;
END;
/

-- 3) CheckPoint 마스터 — 표준 점검 문항(카테고리 제목 check_point + 개별 문항 detail). 7개 카테고리 21개 문항. 모든 프로그램 공통.
-- 기본 구조
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('기본 구조', 'C 프로그램과 Java 프로그램의 대응 관계가 명확한가 (서비스/모듈/함수/래퍼 대응 관계)', 1);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('기본 구조', 'C에는 있으나 Java에 없는 업무 로직이 있는가', 2);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('기본 구조', 'C에는 없는데 Java에 추가된 업무 로직이 있는가', 3);
-- 입력값 처리
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('입력값 처리', '입력 전문 항목이 Java 입력 VO에 동일하게 반영되었는가', 4);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('입력값 처리', '기본값, 필수값 처리가 동일한가', 5);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('입력값 처리', 'blank, null, 0, 빈 문자열 처리 방식이 C와 동일한가', 6);
-- 업무 조건·분기
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('업무 조건·분기', '주요 if/switch 조건과 업무 판단 기준이 동일한가', 7);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('업무 조건·분기', 'AND/OR 조건, 부등호가 동일하게 전환되었는가', 8);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('업무 조건·분기', '특정 계좌, 특정 업무 구분에 대한 별도 처리가 동일한가', 9);
-- 계산 로직
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('계산 로직', '금액, 수량, 단가, 비율 계산 방식이 동일한가', 10);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('계산 로직', '반올림/절사 기준이 동일하게 적용되었는가', 11);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('계산 로직', '절사 시 소수점 자리수가 동일하게 적용되었는가', 12);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('계산 로직', 'BigDecimal 기준 수식 변환이 정확하게 이루어졌는가', 13);
-- 오류 처리
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('오류 처리', '오류 발생 조건과 오류코드, 메시지가 동일한가', 14);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('오류 처리', 'C의 return FAILURE가 exception 처리로 바르게 변환되었는가', 15);
-- 조회·데이터 처리
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('조회·데이터 처리', 'C에서의 래퍼와 동일한 Mapper가 호출되는가', 16);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('조회·데이터 처리', 'SQL 입력 조건, 정렬 기준, 최대 건수가 동일한가', 17);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('조회·데이터 처리', '0건일 때 처리 방식이 동일한가', 18);
-- 출력값 세팅
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('출력값 세팅', '주요 출력 항목, 리스트, count가 동일한가', 19);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('출력값 세팅', '결과값이 없을 때 blank, 0, null 처리 방식이 동일한가', 20);
INSERT INTO comparsion_check_point (check_point, detail, sort_order) VALUES ('출력값 세팅', '결과값의 포맷이 동일한가? (타입, 자리수 등)', 21);
COMMIT;

-- 4) CheckList — 프로그램별 점검 상태. (services × check_point 교차곱, 전부 'NONE'(선택안함)으로 시드)
INSERT INTO comparsion_check_list (check_point_id, service_id, status)
SELECT cp.id, s.service_id, 'NONE'
FROM comparsion_check_point cp
CROSS JOIN (SELECT DISTINCT service_id FROM comparsion_services) s;
COMMIT;

-- 5) 확인용 건수 조회 (선택)
SELECT 'services'    AS tbl, COUNT(*) AS cnt FROM comparsion_services
UNION ALL SELECT 'threads',     COUNT(*) FROM comparsion_discussion_thread
UNION ALL SELECT 'messages',    COUNT(*) FROM comparsion_discussion_message
UNION ALL SELECT 'check_point', COUNT(*) FROM comparsion_check_point
UNION ALL SELECT 'check_list',  COUNT(*) FROM comparsion_check_list;
