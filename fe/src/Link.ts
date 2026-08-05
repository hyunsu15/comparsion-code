import type { CodeKind } from './discussionService';

/**
 * 소스 코드 세트를 정의하는 공용 인터페이스
 */
export interface CodeSourceSet {
  sourceA?: string;
  sourceB?: string;
}

export type CodeLang = 'c' | 'java' | 'xml' | 'sql';

interface CodeAsset {
  /** 실제 내용은 선택 시점에 1회만 가져온다(지연 로딩). */
  load: () => Promise<string>;
  lang: CodeLang;
  path: string;
}

// ──────────────────────────────────────────────────────────────────────────
// 폴더 구조 호환
//   pb  : code/c/**/*.pc                 (또는 *.c / *.h)
//   pb5 : code/java/**/*-online/**/*.java | *.xml   (-online 폴더는 임의 깊이)
//   구버전: code/<service_id>/  안에 .pc + .java 가 함께 있는 형태
//
// 어느 쪽이든 "확장자"로 pb/pb5 를 가르고, 파일 매칭은 경로가 아니라 "파일명(basename)"
// 기준이므로 -online 폴더가 몇 단계 깊이에 있든(폴더가 어떻게 중첩되든) 안전하다.
// 또한 내용을 미리 전부 번들에 넣지 않고(지연 import) 선택 시에만 가져와
// 초기 로딩/번들 크기를 줄인다.
// ──────────────────────────────────────────────────────────────────────────
// 원본 '바이트'가 필요하므로 ?url 로 받아 fetch 한다.
// (Vite의 ?raw 는 UTF-8 로만 디코딩 → EUC-KR 한글이 U+FFFD 로 손실되어 사후 복원 불가)
const modules = import.meta.glob('/src/assets/code/**/*.{c,h,pc,cpp,hpp,java,xml,sql}', {
  query: '?url',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const KNOWN_EXTS = new Set(['c', 'h', 'pc', 'cpp', 'hpp', 'java', 'xml', 'sql']);

const extOf = (path: string): string => {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
};

const baseNameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const stemOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.slice(0, dot);
};

const langForExt = (ext: string): CodeLang => {
  if (ext === 'java') return 'java';
  if (ext === 'xml') return 'xml';
  if (ext === 'sql') return 'sql';
  return 'c';
};

const kindForExt = (ext: string): CodeKind => (ext === 'java' || ext === 'xml' ? 'pb5' : 'pb');

// PB 물리 파일에는 프로그램ID 뒤에 접미사가 붙기도 한다(예: ACCT001_APS.pc).
// 반면 DB의 file_name 은 접미사 없는 프로그램ID(ACCT001)인 경우가 많다.
// 양쪽을 같은 키로 맞추기 위해, stem 에서 이 접미사를 떼어 낸 형태도 함께 쓴다.
// 다른 접미사가 생기면 여기에 추가하면 된다(대소문자 무시).
const PB_NAME_SUFFIXES = ['_APS'];

const stripPbSuffix = (stem: string): string => {
  const upper = stem.toUpperCase();
  for (const suf of PB_NAME_SUFFIXES) {
    // 접미사만 남는 경우(예: stem === '_APS')는 제외해 빈 키가 되지 않게 한다.
    if (upper.endsWith(suf) && upper.length > suf.length) {
      return stem.slice(0, stem.length - suf.length);
    }
  }
  return stem;
};

// file_name(프로그램ID) → 실제 파일을 빠르게 찾기 위한 kind별 인덱스.
// 파일 풀네임('AcctService.java')과 stem('AcctService') 두 키로 넣어 둔다.
const indexByKind: Record<CodeKind, Map<string, CodeAsset>> = {
  pb: new Map(),
  pb5: new Map(),
};

// 매퍼 XML 전용 인덱스: 'AcctMapper.xml' 과 'AcctMapper' 키로 찾는다(java 와 혼동 방지).
const xmlByName: Map<string, CodeAsset> = new Map();

// SQL 보기 전용: PB(.pc) 파일을 '풀네임(basename)' 소문자 키로 찾는 대소문자 무시 인덱스.
//   '{접두사}_{pbsql}.pc' 매칭에서 pbsql 대소문자 차이를 흡수한다.
const pcByNameCI: Map<string, CodeAsset> = new Map();

// 구버전 호환용: code/<폴더>/ 의 첫 폴더명(= 구버전 service_id)으로 묶은 프리셋.
// file_name 매칭에 실패했을 때만 폴백으로 사용한다.
export const LINK_PRESETS: Record<string, { pb?: CodeAsset; pb5?: CodeAsset }> = {};

const addKey = (map: Map<string, CodeAsset>, key: string, asset: CodeAsset) => {
  // 키가 겹치면 먼저 발견한 파일을 유지한다(빌드 간 결정적 동작 / glob 정렬 순서 고정).
  if (key && !map.has(key)) map.set(key, asset);
};

// ──────────────────────────────────────────────────────────────────────────
// 인코딩 자동 복원: PB(C/PC) 소스가 EUC-KR(CP949)로 저장돼 있으면 한글이 깨진다.
// 원본 바이트를 'UTF-8(엄격)'로 먼저 해석하고, 실패하면 EUC-KR로 폴백해 자동 복원한다.
//   - UTF-8/ASCII 파일 → 그대로 (유효한 UTF-8이면 엄격 디코딩 성공)
//   - EUC-KR PB 소스   → UTF-8 디코딩 실패 → EUC-KR로 복원
// 깨졌을 때만 폴백하므로 안전하다. pb5(java/xml)는 UTF-8 가정.
// ──────────────────────────────────────────────────────────────────────────
let eucKrDecoder: TextDecoder | null = null;
try {
  eucKrDecoder = new TextDecoder('euc-kr'); // 브라우저 표준 디코더(EUC-KR/CP949 포함)
} catch {
  eucKrDecoder = null; // EUC-KR 미지원 환경 안전장치
}

const decodeBytes = (buffer: ArrayBuffer, kind: CodeKind): string => {
  const bytes = new Uint8Array(buffer);
  if (kind !== 'pb') return new TextDecoder('utf-8').decode(bytes); // pb5는 UTF-8
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes); // 유효한 UTF-8이면 그대로
  } catch {
    return (eucKrDecoder ?? new TextDecoder('utf-8')).decode(bytes); // 깨졌으면 EUC-KR로 복원
  }
};

// ?url 로 받은 에셋을 선택 시점에 fetch → 원본 바이트를 인코딩 판별 후 디코딩(지연 로딩 유지).
const loadAndDecode = async (loadUrl: () => Promise<string>, kind: CodeKind): Promise<string> => {
  const url = await loadUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`소스 파일을 가져오지 못했습니다: ${url} (HTTP ${res.status})`);
  return decodeBytes(await res.arrayBuffer(), kind);
};

for (const [path, loadUrl] of Object.entries(modules)) {
  const ext = extOf(path);
  if (!KNOWN_EXTS.has(ext)) continue;

  const kind = kindForExt(ext);
  const asset: CodeAsset = { load: () => loadAndDecode(loadUrl, kind), lang: langForExt(ext), path };
  const name = baseNameOf(path);

  addKey(indexByKind[kind], name, asset); // 'AcctService.java'
  addKey(indexByKind[kind], stemOf(name), asset); // 'AcctService'
  if (kind === 'pb') {
    // 접미사(_APS 등) 없는 프로그램ID로도 찾히게: 'ACCT001_APS' → 'ACCT001'
    addKey(indexByKind[kind], stripPbSuffix(stemOf(name)), asset);
    // SQL 보기용 대소문자 무시 풀네임 인덱스: 'PB_Acct.pc' → 'pb_acct.pc'
    addKey(pcByNameCI, name.toLowerCase(), asset);
  }
  if (ext === 'xml') {
    addKey(xmlByName, name, asset); // 'AcctMapper.xml'
    addKey(xmlByName, stemOf(name), asset); // 'AcctMapper'
  }

  const folder = path.match(/\/code\/([^/]+)\//)?.[1];
  if (folder) {
    (LINK_PRESETS[folder] ??= {})[kind] ??= asset;
  }
}

// DB file_name 에서 실제 파일을 찾기 위한 후보 키들(우선순위 순).
//   'AcctService.java'          → ['AcctService.java', 'AcctService']
//   'ACCT001.pc'                → ['ACCT001.pc', 'ACCT001']
//   'EmpProcess.processEmployee'→ ['EmpProcess.processEmployee', 'EmpProcess']  (Class.method)
//   'com.x.Emp.run'             → ['com.x.Emp.run', 'Emp']                      (pkg.Class.method)
const candidateKeys = (fileName: string): string[] => {
  const trimmed = fileName.trim();
  const keys = [trimmed];

  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot > 0) {
    const lastSeg = trimmed.slice(lastDot + 1).toLowerCase();
    const head = trimmed.slice(0, lastDot);
    if (KNOWN_EXTS.has(lastSeg)) {
      keys.push(head); // 진짜 확장자 → 확장자만 떼기
    } else {
      keys.push(head.slice(head.lastIndexOf('.') + 1)); // Class.method → 클래스명만
    }
  }
  return keys;
};

const pickAsset = (fileName: string | null | undefined, kind: CodeKind): CodeAsset | undefined => {
  if (!fileName) return undefined;
  const map = indexByKind[kind];
  const keys = candidateKeys(fileName);

  // pb: DB file_name 에 접미사(_APS)가 붙어 와도 떼고 다시 시도(반대 방향 매칭).
  // exact 후보를 먼저 시도한 뒤 접미사 제거형을 뒤에 붙여 우선순위를 보존한다.
  if (kind === 'pb') {
    for (const k of keys.slice()) {
      const stripped = stripPbSuffix(k);
      if (stripped !== k && !keys.includes(stripped)) keys.push(stripped);
    }
  }

  for (const key of keys) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return undefined;
};

/**
 * 소스 해석 결과 상태.
 *   - 'ok'         : 매칭된 파일을 찾아 내용까지 로드함
 *   - 'empty-name' : DB file_name 이 비어 있음(해당 측 소스 미등록)
 *   - 'not-found'  : file_name 은 있으나 매칭되는 에셋 파일이 없음
 */
export type ResolveStatus = 'ok' | 'empty-name' | 'not-found';

export interface ResolvedSource {
  content: string;
  lang: CodeLang;
  status: ResolveStatus;
}

/**
 * DB의 file_name(프로그램ID)으로 한쪽(pb/pb5) 소스를 가져온다.
 * 1) file_name 으로 직접 매칭(새 폴더 구조) → 2) 실패 시 fallbackKey(구버전 폴더=service_id)로 폴백.
 * 내용은 이 시점에 1회만 지연 로딩한다. 실패 사유는 status 로 알려 호출부가 디버깅 가능한 메시지를 만들 수 있게 한다.
 */
export async function resolveSourceContent(
  fileName: string | null | undefined,
  kind: CodeKind,
  fallbackKey?: string,
): Promise<ResolvedSource> {
  const lang: CodeLang = kind === 'pb' ? 'c' : 'java';
  if (!fileName || !fileName.trim()) return { content: '', lang, status: 'empty-name' };

  const asset =
    pickAsset(fileName, kind) ?? (fallbackKey ? LINK_PRESETS[fallbackKey]?.[kind] : undefined);

  if (!asset) return { content: '', lang, status: 'not-found' };
  return { content: await asset.load(), lang: asset.lang, status: 'ok' };
}

/**
 * 매퍼 클래스명(또는 파일명)으로 XML 매퍼 파일을 찾아 지연 로딩한다.
 *   resolveXmlByName('AcctMapper') → { content, path } | null
 */
export async function resolveXmlByName(
  name: string | null | undefined,
): Promise<{ content: string; path: string } | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const asset = xmlByName.get(trimmed) ?? xmlByName.get(stemOf(trimmed));
  if (!asset) return null;
  return { content: await asset.load(), path: asset.path };
}

/**
 * SQL 보기용: '{접두사}_{pbsql}.pc' 같은 PB 파일명을 대소문자 무시로 찾아 지연 로딩한다.
 *   resolvePcByNameCI('PB_Acct.pc') → { content, path } | null
 */
export async function resolvePcByNameCI(
  fileName: string | null | undefined,
): Promise<{ content: string; path: string } | null> {
  const key = fileName?.trim().toLowerCase();
  if (!key) return null;
  const asset = pcByNameCI.get(key);
  if (!asset) return null;
  return { content: await asset.load(), path: asset.path };
}

export default LINK_PRESETS;
