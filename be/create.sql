-- =====================================================================
-- 토론(discussion) 스키마 — A 포맷
--  - thread = 스레드 '메타데이터'만 보관 (본문/작성자 없음)
--  - message = 첫 글(오프닝)부터 모든 글을 보관
--  - 조회 시 thread 응답에 '첫 메시지'(content/writer_role/writer_name)를
--    JOIN 해서 합쳐 내려준다 (저장은 A, 응답은 B 뷰).
-- =====================================================================

-- 1. Discussion Thread 테이블 (스레드 메타데이터)
CREATE TABLE comparsion_discussion_thread (
    id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- 상태는 '마지막 글쓴이'에서 파생되는 값. (pb 글 → CHECK_PB5, pb5 글 → CHECK_PB)
    -- 갱신 책임을 한 곳에 모은다: 스레드 생성 시 1회, 이후 메시지가 추가될 때마다 갱신.
    -- 그 외 경로에서는 status 를 직접 바꾸지 않는다 (드리프트 방지).
    status      VARCHAR2(20) DEFAULT 'CHECK_PB5' NOT NULL,
    opinion_type VARCHAR2(20),                         -- 의견 유형: MISMATCH/OMISSION/EXPLANATION/BUSINESS_CHECK/ETC. 스레드 생성 시 필수(앱 레벨 강제), 이후 불변
    code_kind   VARCHAR2(10) NOT NULL,                 -- 마커가 찍히는 코드 쪽: pb or pb5
    service_id  VARCHAR2(100) NOT NULL,                 -- 문자열 10자리
    location    NUMBER NOT NULL,                       -- 줄 번호
    resolved_at DATE,                                  -- 해결 시각 (한국시간)
    created_at  DATE DEFAULT CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS DATE) NOT NULL, -- 생성 시각 (한국시간)
    CONSTRAINT chk_thread_status CHECK (status IN ('CHECK_PB', 'CHECK_PB5', 'RESOLVED')),
    CONSTRAINT chk_thread_opinion_type CHECK (opinion_type IN ('MISMATCH', 'OMISSION', 'EXPLANATION', 'BUSINESS_CHECK', 'ETC')),
    CONSTRAINT chk_thread_code_kind CHECK (code_kind IN ('pb', 'pb5'))
);

-- 인덱스 생성: service_id 및 resolved_at
CREATE INDEX idx_thread_service_id ON comparsion_discussion_thread(service_id);
CREATE INDEX idx_thread_resolved_at ON comparsion_discussion_thread(resolved_at);

-- 2. Discussion Message 테이블 (첫 글 포함 모든 글)
CREATE TABLE comparsion_discussion_message (
    id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    thread_id   NUMBER NOT NULL,
    writer_role VARCHAR2(50) NOT NULL,                 -- 작성자 측/역할: pb or pb5 (작성자 식별자가 아님 — 이름은 writer_name)
    writer_name VARCHAR2(100) NOT NULL,                -- 작성자 이름 (빈 값 불가)
    content     CLOB NOT NULL,                         -- 길이 제한 없음
    reaction    VARCHAR2(20),                          -- 처리 리액션: REVIEWING/DONE/SKIP (NULL=미설정). 메시지(댓글)마다 수동 설정
    created_at  DATE DEFAULT CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS DATE) NOT NULL, -- 생성 시각 (한국시간)
    CONSTRAINT fk_message_thread FOREIGN KEY (thread_id)
        REFERENCES comparsion_discussion_thread(id) ON DELETE CASCADE,
    CONSTRAINT chk_message_writer_role CHECK (writer_role IN ('pb', 'pb5')),
    CONSTRAINT chk_message_reaction CHECK (reaction IN ('REVIEWING', 'DONE', 'SKIP'))
);

-- 인덱스 생성: thread_id (메시지 조회 성능 향상 — 스레드 열 때마다 WHERE thread_id 조회)
CREATE INDEX idx_message_thread_id ON comparsion_discussion_message(thread_id);

-- 3. Services 테이블 생성 (서비스 메타 정보)
-- 하나의 service_id가 pb/pb5 두 행(소스)을 가지므로 (service_id, code_kind) 복합 PK
CREATE TABLE comparsion_services (
    service_id      VARCHAR2(100) NOT NULL,             -- 프로그램명 (소분류 역할: 비교 대상 선택 키)
    big_category    VARCHAR2(100),                     -- 분류
    middle_category VARCHAR2(100),                     -- 업무
    code_kind       VARCHAR2(10) NOT NULL,             -- PB프로그램ID이면 pb, PB5프로그램ID이면 pb5
    file_name       VARCHAR2(255),                     -- PB프로그램ID OR PB5프로그램ID
    CONSTRAINT pk_comparsion_services PRIMARY KEY (service_id, code_kind),
    CONSTRAINT chk_services_code_kind CHECK (code_kind IN ('pb', 'pb5'))
);

-- 코멘트 추가 (선택 사항)
COMMENT ON TABLE  comparsion_discussion_thread IS 'github issue + slack 쓰레드 방식의 토론 스레드 메타데이터 (본문/작성자는 message 테이블)';
COMMENT ON COLUMN comparsion_discussion_thread.status IS '상태(CHECK_PB/CHECK_PB5/RESOLVED). 마지막 글쓴이에서 파생 — 스레드 생성/메시지 추가 시에만 갱신';
COMMENT ON COLUMN comparsion_discussion_thread.opinion_type IS '의견 유형(MISMATCH=불일치 의심/OMISSION=누락 의심/EXPLANATION=설명 요청/BUSINESS_CHECK=업무 확인 필요/ETC=기타). 스레드 생성 시 필수';
COMMENT ON COLUMN comparsion_discussion_thread.code_kind IS '마커가 찍히는 코드 종류: pb, pb5';
COMMENT ON TABLE  comparsion_discussion_message IS '토론 스레드의 글(첫 글 + 답글 모두). 가장 오래된 글이 스레드 본문(오프닝)';
COMMENT ON COLUMN comparsion_discussion_message.writer_role IS '작성자 측/역할: pb, pb5 (작성자 식별이 아님)';
COMMENT ON COLUMN comparsion_discussion_message.writer_name IS '작성자 이름 (빈 값 불가)';
COMMENT ON COLUMN comparsion_discussion_message.reaction IS '처리 리액션(REVIEWING=확인중/DONE=조치완료/SKIP=조치불필요, NULL=미설정). 댓글마다 수동 설정 — 스레드 제목엔 가장 최근 메시지의 리액션이 마지막 리액션으로 파생 표시';
COMMENT ON TABLE  comparsion_services IS '비교 대상 서비스 메타 정보 테이블';
COMMENT ON COLUMN comparsion_services.service_id      IS '프로그램명';
COMMENT ON COLUMN comparsion_services.big_category    IS '분류';
COMMENT ON COLUMN comparsion_services.middle_category IS '업무';
COMMENT ON COLUMN comparsion_services.code_kind       IS 'PB프로그램ID이면 pb, PB5프로그램ID이면 pb5';
COMMENT ON COLUMN comparsion_services.file_name       IS 'PB프로그램ID OR PB5프로그램ID';

-- 4. CheckPoint 테이블 (점검 항목 '마스터' — 표준 체크리스트 정의, 모든 프로그램 공통)
--  - 1행 = 점검 '문항' 1개. check_point = 카테고리(제목, 같은 값이 여러 문항에 반복), detail = 개별 점검 문항.
--    프론트는 check_point(제목)로 그룹핑해 카테고리 단위로 접기/펼치기한다.
CREATE TABLE comparsion_check_point (
    id          NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    check_point VARCHAR2(1000) NOT NULL,               -- 카테고리(제목) — 같은 값이 여러 문항에 반복
    detail      VARCHAR2(4000) NOT NULL,               -- 개별 점검 문항 1개
    sort_order  NUMBER DEFAULT 0 NOT NULL              -- 표시 순서 (백엔드 ORDER BY 기준)
);

-- 5. CheckList 테이블 (프로그램별 점검 '상태' — check_point × service_id)
--  - 정의는 check_point, 상태(완료여부/메모)는 여기. is_check 는 0/1 + CHECK(오라클 BOOLEAN 부재).
CREATE TABLE comparsion_check_list (
    id             NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    check_point_id NUMBER         NOT NULL,             -- FK → comparsion_check_point.id
    service_id     VARCHAR2(100)  NOT NULL,             -- 프로그램명 (comparsion_services.service_id)
    file_name      VARCHAR2(255),                       -- PB/PB5 프로그램ID (보류 컬럼)
    comment_text   VARCHAR2(4000),                      -- 프로그램별 메모 (API 필드명 comment) — COMMENT 는 오라클 예약어
    status         VARCHAR2(10) DEFAULT 'NONE' NOT NULL, -- 점검 상태: NONE/YES/NO/NA/HOLD (선택안함/예/아니오/해당없음/판단 보류). 기본 NONE
    update_date    DATE DEFAULT CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS DATE) NOT NULL,
    CONSTRAINT fk_check_list_point FOREIGN KEY (check_point_id)
        REFERENCES comparsion_check_point(id) ON DELETE CASCADE,
    CONSTRAINT uq_check_list UNIQUE (check_point_id, service_id),  -- 한 프로그램에 같은 항목은 1행
    CONSTRAINT chk_check_list_status CHECK (status IN ('YES', 'NO', 'NA', 'HOLD', 'NONE'))
);

CREATE INDEX idx_check_list_service ON comparsion_check_list(service_id);

COMMENT ON TABLE  comparsion_check_point               IS '점검 항목 마스터(표준 체크리스트 정의). 모든 프로그램 공통';
COMMENT ON COLUMN comparsion_check_point.check_point   IS '카테고리(제목) — 같은 값이 여러 문항에 반복';
COMMENT ON COLUMN comparsion_check_point.detail        IS '개별 점검 문항 1개';
COMMENT ON COLUMN comparsion_check_point.sort_order    IS '표시 순서';
COMMENT ON TABLE  comparsion_check_list                IS '프로그램(service_id)별 점검 상태(완료여부/메모). check_point × service_id';
COMMENT ON COLUMN comparsion_check_list.check_point_id IS 'comparsion_check_point.id (FK)';
COMMENT ON COLUMN comparsion_check_list.service_id     IS '프로그램명 (comparsion_services 와 동일)';
COMMENT ON COLUMN comparsion_check_list.file_name      IS 'PB/PB5 프로그램ID (보류 컬럼)';
COMMENT ON COLUMN comparsion_check_list.comment_text   IS '프로그램별 메모 (API/응답 필드명 comment)';
COMMENT ON COLUMN comparsion_check_list.status         IS '점검 상태: NONE/YES/NO/NA/HOLD (선택안함/예/아니오/해당없음/판단 보류). 기본 NONE';
COMMENT ON COLUMN comparsion_check_list.update_date    IS '최종 변경 시각 (한국시간)';