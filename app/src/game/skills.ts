// Skill progression: five skills that level 1→20 from the activities you do,
// each granting escalating, permanent benefits. Separate from the account
// XP/level (progression.ts) — these reward *specialising*. XP is tracked per
// skill in the save; FarmScene awards it on the matching action and reads the
// benefit multipliers below.

export type SkillId = 'farming' | 'ranching' | 'breeding' | 'fishing' | 'foraging';

export const SKILL_IDS: SkillId[] = ['farming', 'ranching', 'breeding', 'fishing', 'foraging'];

export const MAX_SKILL_LEVEL = 20;

export type Skills = Record<SkillId, number>; // xp per skill
export const EMPTY_SKILLS: Skills = { farming: 0, ranching: 0, breeding: 0, fishing: 0, foraging: 0 };

// ---- level curve --------------------------------------------------------
// Cumulative XP required to *reach* a given level (level 1 = 0 XP, capped at 20).
export function skillXpForLevel(level: number): number {
  const l = Math.min(level, MAX_SKILL_LEVEL);
  let total = 0;
  for (let i = 1; i < l; i++) total += Math.round(40 * Math.pow(i, 1.55));
  return total;
}

export type SkillInfo = { level: number; into: number; need: number; pct: number; max: boolean };

export function skillInfo(xp: number): SkillInfo {
  let level = 1;
  while (level < MAX_SKILL_LEVEL && xp >= skillXpForLevel(level + 1)) level++;
  if (level >= MAX_SKILL_LEVEL) return { level: MAX_SKILL_LEVEL, into: 1, need: 1, pct: 1, max: true };
  const cur = skillXpForLevel(level);
  const next = skillXpForLevel(level + 1);
  const need = next - cur;
  const into = xp - cur;
  return { level, into, need, pct: need > 0 ? into / need : 1, max: false };
}

export function skillLevel(xp: number): number {
  return skillInfo(xp).level;
}

// ---- definitions + benefits --------------------------------------------
export type SkillDef = {
  id: SkillId;
  name: string;
  icon: string; // emoji
  blurb: string;
  // human-readable benefit at a given level (level 0 shown as "—")
  desc: (level: number) => string;
};

export const SKILLS: SkillDef[] = [
  {
    id: 'farming', name: 'Farming', icon: '🌾',
    blurb: 'Harvesting crops.',
    desc: (l) => `+${(l * 2)}% growth speed · +${(l * 1.5).toFixed(0)}% crop value`,
  },
  {
    id: 'ranching', name: 'Ranching', icon: '🐄',
    blurb: 'Collecting eggs, milk & fruit.',
    desc: (l) => `+${l * 3}% product value · ${(l * 2)}% faster output`,
  },
  {
    id: 'breeding', name: 'Breeding', icon: '🥚',
    blurb: 'Raising baby animals.',
    desc: (l) => `+${Math.floor(l / 4)} herd cap · +${l * 2}% faster breeding`,
  },
  {
    id: 'fishing', name: 'Fishing', icon: '🎣',
    blurb: 'Casting at the pond.',
    desc: (l) => `+${l * 5}% rare catch · +${l * 3}% fish value`,
  },
  {
    id: 'foraging', name: 'Foraging', icon: '🍄',
    blurb: 'Gathering wild finds.',
    desc: (l) => `+${l * 5}% rare finds · +${l * 3}% forage value`,
  },
];

export const SKILL_BY_ID: Record<SkillId, SkillDef> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
) as Record<SkillId, SkillDef>;

// ---- benefit multipliers (applied in gameplay) --------------------------
export const farmingGrowthMult = (lvl: number) => 1 + 0.02 * lvl; // up to +40%
export const farmingValueMult = (lvl: number) => 1 + 0.015 * lvl; // up to +30%
export const ranchingValueMult = (lvl: number) => 1 + 0.03 * lvl; // up to +60%
export const ranchingSpeedMult = (lvl: number) => 1 + 0.02 * lvl; // up to +40% faster
export const breedingCapBonus = (lvl: number) => Math.floor(lvl / 4); // up to +5
export const breedingSpeedMult = (lvl: number) => 1 + 0.02 * lvl; // up to +40% faster
export const fishingLuck = (lvl: number) => 1 + 0.05 * lvl; // up to +100% rare odds
export const fishingValueMult = (lvl: number) => 1 + 0.03 * lvl; // up to +60%
export const foragingLuck = (lvl: number) => 1 + 0.05 * lvl;
export const foragingValueMult = (lvl: number) => 1 + 0.03 * lvl;
