// 여러 리포지토리에서 공유하는 공통 SQL 표현식 모음.

// 생성/해결/갱신 시각을 한국시간(KST) DATE로 기록하기 위한 표현식.
export const KST_NOW = `CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS DATE)`;
