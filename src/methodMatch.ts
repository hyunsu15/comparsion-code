import type { MethodInfo } from './methodTypes';

// ──────────────────────────────────────────────────────────────────────────
// 점프 이름 매칭: 1순위 정규화 일치, 2순위 특수문자 제외·대소문자 무시 pb⊇pb5 포함.
// (메소드 단위 파싱에 기댄 복잡한 매칭을 단순 이름 규칙으로 대체)
// ──────────────────────────────────────────────────────────────────────────

// 메소드명 정규화: 영숫자만 남기고 소문자화. snake_case/camelCase 차이를 흡수한다.
const normalizeMethodName = (name: string) => (
  name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
);

// pb/pb5 이름 매칭 등급. 2=정규화 일치, 1=pb가 pb5를 포함(pb⊇pb5, 단방향), 0=무매칭.
export const matchRank = (pbName: string, pb5Name: string): 0 | 1 | 2 => {
  const pb = normalizeMethodName(pbName);
  const pb5 = normalizeMethodName(pb5Name);
  if (!pb || !pb5) return 0; // 빈 정규화는 매칭 금지(includes("") 과매칭 방지)
  if (pb === pb5) return 2;
  if (pb.includes(pb5)) return 1;
  return 0;
};

// sourceName 에 대응하는 메소드를 candidates 에서 찾는다(Alt+클릭 좌우 점프).
//   sourceIsPb=true  → source 가 pb, candidates 가 pb5 : matchRank(source, cand)
//   sourceIsPb=false → source 가 pb5, candidates 가 pb : matchRank(cand, source)
// 1순위(정규화 일치) > 2순위(pb⊇pb5 포함), 동급이면 길이차가 가장 작은(가장 가까운) 것.
export const findCorrespondingMethod = (
  candidates: MethodInfo[],
  sourceName: string,
  sourceIsPb: boolean,
  skip?: (m: MethodInfo) => boolean,
): MethodInfo | null => {
  const sourceNorm = normalizeMethodName(sourceName);
  if (!sourceNorm) return null;
  let best: MethodInfo | null = null;
  let bestRank = 0;
  let bestDiff = Infinity;
  for (const m of candidates) {
    if (skip?.(m)) continue;
    const rank = sourceIsPb ? matchRank(sourceName, m.name) : matchRank(m.name, sourceName);
    if (rank === 0) continue;
    const diff = Math.abs(normalizeMethodName(m.name).length - sourceNorm.length);
    if (rank > bestRank || (rank === bestRank && diff < bestDiff)) {
      best = m;
      bestRank = rank;
      bestDiff = diff;
    }
  }
  return best;
};

// 자동 점프: file_name 에서 뽑은 targetName 과 가장 잘 맞는 메소드를 찾는다.
//   1순위 정규화 일치 > 2순위 포함(양방향 — 한 이름으로 좌/우를 모두 찾으므로 관대하게).
//   동급이면 길이차 최소. 무매칭이면 null(점프하지 않음).
export const findMethodByName = (methods: MethodInfo[], targetName: string): MethodInfo | null => {
  const target = normalizeMethodName(targetName);
  if (!target) return null;
  let best: MethodInfo | null = null;
  let bestRank = 0;
  let bestDiff = Infinity;
  for (const m of methods) {
    const n = normalizeMethodName(m.name);
    if (!n) continue;
    let rank = 0;
    if (n === target) rank = 2;
    else if (n.includes(target) || target.includes(n)) rank = 1;
    if (rank === 0) continue;
    const diff = Math.abs(n.length - target.length);
    if (rank > bestRank || (rank === bestRank && diff < bestDiff)) {
      best = m;
      bestRank = rank;
      bestDiff = diff;
    }
  }
  return best;
};
