// 코드 텍스트를 줄 단위로 스캔하며 중괄호/블록 범위를 계산하는 공용 저수준 헬퍼.
// C(extractCMethods)·Java(extractJavaMethods) 추출기가 함께 사용한다.

// 한 줄에서 문자열/주석을 제거해 '실제 코드'만 남긴다(중괄호·괄호 계산용).
// state.inBlockComment 로 블록 주석이 여러 줄에 걸쳐도 유지된다.
export const stripCodeForBraces = (line: string, state: { inBlockComment: boolean }) => {
  let result = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (state.inBlockComment) {
      if (char === '*' && next === '/') {
        state.inBlockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      state.inBlockComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '/') break;

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    result += char;
  }

  return result;
};

// startIndex(여는 '{' 가 있는 줄)부터 짝이 맞는 '}' 줄 번호(1-base)를 찾는다.
export const findBlockEndLine = (lines: string[], startIndex: number) => {
  const commentState = { inBlockComment: false };
  let braceCount = 0;
  let foundOpen = false;

  for (let j = startIndex; j < lines.length; j++) {
    const lineText = stripCodeForBraces(lines[j], commentState);

    for (const char of lineText) {
      if (char === '{') {
        braceCount++;
        foundOpen = true;
      } else if (char === '}') {
        braceCount--;
      }
    }

    if (foundOpen && braceCount === 0) return j + 1;
  }

  return startIndex + 1;
};
