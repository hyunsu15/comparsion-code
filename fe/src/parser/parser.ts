/**
 * 소스 parser — 대분류(big_category)별로 file_name(프로그램ID)을
 * "매칭 대상"으로 해석하는 전략. 새 대분류는 구현체를 추가해서 확장한다.
 *
 * pb(구버전)와 pb5(신버전)는 매칭 대상 형태가 달라 타겟 타입을 분리한다.
 */

/** pb(구버전) 매칭 대상 */
export interface PbMatchTarget {
  /** pb 물리 파일명 등 매칭에 쓸 식별값 (예: <id>_APS.pc) */
  fileName: string;
  /** 메소드 단위로 매칭할 때만 채워진다 (PbTransferFileNameMethodParser) */
  methodName?: string;
}

/** pb5(신버전) 매칭 대상 */
export interface Pb5MatchTarget {
  /** 매칭할 클래스 (예: EmpProcessImpl) */
  className: string;
  /** 메소드 단위로 매칭할 때만 채워진다 (예: processEmployee) */
  methodName?: string;
}

/**
 * 공통 parser 인터페이스 — 다형성의 축.
 * supports() 로 담당 대분류를 가리고, parse() 로 file_name 을 매칭 대상으로 변환한다.
 */
export interface SourceParser<TTarget> {
  /** 이 parser 가 담당하는지 — 대분류(bigCategory) 또는 파일명(fileName)으로 판단 */
  supports(
    bigCategory: string | null | undefined,
    fileName: string | null | undefined,
  ): boolean;
  /** file_name(프로그램ID/식별자)을 매칭 대상으로 파싱 */
  parse(fileName: string): TTarget;
}

/** pb 소스 parser */
export type PbParser = SourceParser<PbMatchTarget>;

/** pb5 소스 parser */
export type Pb5Parser = SourceParser<Pb5MatchTarget>;
