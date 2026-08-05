// 소스의 import/include 묶음들을 '접기 가능한 영역'으로 찾는다.
// CodeBlock 의 메서드 접기 모델(시작줄 + endLine)을 그대로 재사용하므로 같은 형태로 반환한다.
// (접으면 시작줄만 보이고 그 아래 import 들은 숨겨진다 — IDE 의 import 접기와 동일.)

export interface ImportRegion {
  name: string;
  line: number;    // 1-base: 블록 시작줄(접힘 시 보이는 줄)
  endLine: number; // 1-base: 블록 마지막 줄
}

/**
 * 소스의 import/include 연속 블록들을 모두 반환한다(없거나 모두 1줄뿐이면 빈 배열).
 * 흩어져 있어도(중간에 코드·주석이 끼어 나뉘어도) 각 묶음을 개별 접기 영역으로 잡는다.
 * - java   : `import ...;` 묶음(블록 사이 빈 줄 허용)
 * - c(Pro*C): `#include ...` 및 `EXEC SQL INCLUDE ...` 묶음(빈 줄 허용)
 * - 그 외(xml 등): 빈 배열
 * 한 줄뿐인 묶음은 접어도 가릴 게 없어 제외한다(end > start 인 묶음만).
 */
export function findImportRegions(code: string, lang: string): ImportRegion[] {
  if (!code) return [];

  const isImport =
    lang === 'java'
      ? (s: string) => /^\s*import\s/.test(s)
      : lang === 'c'
        ? (s: string) => /^\s*#\s*include\b/.test(s) || /^\s*EXEC\s+SQL\s+INCLUDE\b/i.test(s)
        : null;
  if (!isImport) return [];

  const lines = code.split('\n');
  const isBlank = (s: string) => s.trim() === '';
  const nameOf = (firstLine: string) =>
    lang === 'java' ? 'import' : /^\s*EXEC/i.test(firstLine) ? 'EXEC SQL INCLUDE' : '#include';

  const regions: ImportRegion[] = [];
  let start = -1;
  let end = -1;
  const flush = () => {
    if (start !== -1 && end > start) {
      regions.push({ name: nameOf(lines[start]), line: start + 1, endLine: end + 1 });
    }
    start = -1;
    end = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    if (isImport(lines[i])) {
      if (start === -1) start = i;
      end = i;
    } else if (start !== -1 && !isBlank(lines[i])) {
      flush(); // 비-빈 코드 줄에서 현재 블록 종료(블록 사이 빈 줄은 허용하고 계속)
    }
  }
  flush(); // 파일 끝에서 열린 블록 마감

  return regions;
}
