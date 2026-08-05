/**
 * 대분류(big_category) 매핑 — 각 parser 의 BIG_CATEGORY(= 클래스 이름 키)를
 * 그 parser 가 담당하는 "운영 대분류명 집합(Set)"으로 변환한다.
 * 한 parser 가 여러 대분류를 담당할 수 있으므로 값은 Set<string> 이다.
 *
 *   categoryMap.get(Pb5XmlParser.BIG_CATEGORY)?.has(bigCategory)  // → 담당 여부
 *
 * ⚠️ 실제 값은 민감한 운영정보다. 소스(.ts)에 하드코딩하지 않고 환경변수 VITE_<클래스이름> 으로 주입한다.
 *   - 값은 콤마(,)로 구분해 여러 대분류를 나열한다(예: VITE_Pb5XmlParser=zzz,국제표준).
 *   - 개발: src/config/.env.development        (개발/테스트 값, 커밋됨)
 *   - 운영: src/config/.env.production.local    (실제값 — `*.local` 이라 gitignore → "암호화"처럼 비공개)
 *   - Vite 는 `VITE_` 접두사만 클라이언트에 노출하고 빌드시 주입한다(import.meta.env).
 *   - 값이 비었거나 미설정이면 개발 폴백값으로 폴백한다.
 *
 * ⚠️ 짝(pb5+pb) 대분류는 같은 집합이어야 한다(한 서비스의 pb·pb5 행은 big_category 동일):
 *     VITE_Pb5XmlParser == VITE_PbSqlParser, VITE_Pb5ServiceParser == VITE_PbServiceParser.
 *
 * 새 parser 추가 시: ① vite-env.d.ts 에 VITE_<클래스이름> 타입 ② .env.* 에 값 ③ 아래 Map 에 한 줄.
 */

// 콤마로 구분된 env 값을 Set 으로 변환(공백 제거, 빈 항목 제외). 미설정/빈값이면 개발 폴백 사용.
const toCategorySet = (raw: string | undefined, devFallback: string): ReadonlySet<string> =>
  new Set(
    (raw && raw.trim() ? raw : devFallback)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const categoryMap: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Pb5ClassImplMethodParser', toCategorySet(import.meta.env.VITE_Pb5ClassImplMethodParser, 'xxx')],
  ['Pb5ClassImplParser', toCategorySet(import.meta.env.VITE_Pb5ClassImplParser, 'yyy')],
  ['Pb5XmlParser', toCategorySet(import.meta.env.VITE_Pb5XmlParser, 'zzz')],
  ['PbSqlParser', toCategorySet(import.meta.env.VITE_PbSqlParser, 'zzz')],
  ['Pb5ServiceParser', toCategorySet(import.meta.env.VITE_Pb5ServiceParser, '서비스')],
  ['PbServiceParser', toCategorySet(import.meta.env.VITE_PbServiceParser, '서비스')],
]);
