import type { CodeSourceSet } from './FileLink';

// 웹 서버의 public/code 경로를 기준으로 하는 기본 경로

export interface CodeSourceSet {
  sourceA?: string;
  sourceB?: string;
}

const files = import.meta.glob(
  '/src/assets/code/**/*.{c,pc,java}',
  {
    eager: true,
    query: '?raw',
    import: 'default',
  }
);

export const LINK_PRESETS: Record<string, CodeSourceSet> = {};

for (const [path, content] of Object.entries(files)) {
  const match = path.match(/\/code\/([^/]+)\//);

  if (!match) continue;

  const folderName = match[1];

  LINK_PRESETS[folderName] ??= {};

  if (path.endsWith('.c') || path.endsWith('.pc')) {
    LINK_PRESETS[folderName].sourceA = content as string;
  }

  if (path.endsWith('.java')) {
    LINK_PRESETS[folderName].sourceB = content as string;
  }
}
// const LINK_PRESETS: Record<string, CodeSourceSet> = {
//   '운영 회원 서비스 모듈': {
//     sourceA: 'https://raw.githubusercontent.com/facebook/react/main/packages/react/src/React.js',
//     sourceB: 'https://github.com/hyunsu15/IL/blob/main/README.md'
//   },
//   '공통 유틸리티 v5.0': {
//     sourceA: 'https://raw.githubusercontent.com/isomorphic-git/isomorphic-git/main/src/index.js',
//     sourceB: 'https://github.com/hyunsu15/java-lotto-8/blob/hyunsu15/src/main/java/lotto/Application.java'
//   },
//   // 폴더명을 string으로 전달하여 매핑하는 예시
//   '내부 프로젝트 A': createCodeSourceSetForFolder('projectA', 'c'),
//   '내부 프로젝트 B': createCodeSourceSetForFolder('projectB'),
// };

export default LINK_PRESETS;