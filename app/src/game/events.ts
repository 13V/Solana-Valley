// Seasonal festivals — a rotating "what's happening in the valley" banner that
// also BUFFS gameplay during its day. One festival is active per in-game day,
// cycling through the list. FarmScene reads the active effect at the mutation
// roll, the growth tick, crop sales, fishing and foraging.
export type EventEffect = {
  mutationLuckMult?: number; // multiplies mutation odds at harvest
  cropValueMult?: number; // multiplies crop sale value
  cropGrowthMult?: number; // multiplies crop growth speed
  fishLuckMult?: number; // multiplies rare-fish luck
  forageLuckMult?: number; // multiplies rare-forage luck
  label: string; // short "what's boosted today" line for the banner
};

export type ValleyEvent = {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  effect: EventEffect;
};

export const EVENTS: ValleyEvent[] = [
  { id: 'ev_spring_bloom', name: 'Spring Bloom Festival', blurb: 'The first flowers burst open — crops grow quicker while the valley wakes up!', emoji: '🌸', effect: { cropGrowthMult: 1.25, label: '+25% crop growth' } },
  { id: 'ev_rain_dance', name: 'Rain Dance Jubilee', blurb: 'Storm clouds roll in and everything grows faster — dance in the puddles!', emoji: '🌧️', effect: { cropGrowthMult: 1.4, label: '+40% crop growth' } },
  { id: 'ev_golden_harvest', name: 'Golden Harvest Gala', blurb: 'Autumn gold blankets the valley — crops fetch top coin at market today.', emoji: '🌾', effect: { cropValueMult: 1.3, label: '+30% crop sale value' } },
  { id: 'ev_mutation_moon', name: 'Mutation Moon Night', blurb: 'A rare silver moon rises — mutations are far more likely tonight. Plant something!', emoji: '🌕', effect: { mutationLuckMult: 3, label: '×3 mutation odds' } },
  { id: 'ev_fishing_frenzy', name: "Fisher's Frenzy Week", blurb: 'The water teems with rare catches — cast a line for shimmering loot!', emoji: '🎣', effect: { fishLuckMult: 2, label: '×2 fishing luck' } },
  { id: 'ev_animal_fair', name: 'Valley Animal Fair', blurb: 'Market day! The whole valley turns out and crops sell for more.', emoji: '🐄', effect: { cropValueMult: 1.2, label: '+20% crop sale value' } },
  { id: 'ev_forage_feast', name: "Forager's Feast", blurb: 'Wild finds are everywhere this week — rarer forage hides in the grass.', emoji: '🍄', effect: { forageLuckMult: 2, label: '×2 foraging luck' } },
  { id: 'ev_starlight_market', name: 'Starlight Night Market', blurb: 'Lanterns light the valley under the stars — traders pay a premium tonight.', emoji: '✨', effect: { cropValueMult: 1.25, label: '+25% crop sale value' } },
  { id: 'ev_winter_solstice', name: 'Solstice Warmth Festival', blurb: 'The longest night calls for a bonfire — and generous prices for your harvest.', emoji: '🔥', effect: { cropValueMult: 1.35, label: '+35% crop sale value' } },
  { id: 'ev_pumpkin_patch', name: 'Pumpkin Patch Parade', blurb: 'Giant gourds roll in — everything in the soil grows quicker today.', emoji: '🎃', effect: { cropGrowthMult: 1.3, label: '+30% crop growth' } },
  { id: 'ev_rainbow_crop', name: 'Rainbow Crop Carnival', blurb: 'Prismatic mutations bloom — your best chance yet at a rainbow crop!', emoji: '🌈', effect: { mutationLuckMult: 2.5, label: '×2.5 mutation odds' } },
  { id: 'ev_seed_swap', name: 'Grand Seed Swap', blurb: 'The valley shares its secrets — seeds sprout faster all day.', emoji: '🌱', effect: { cropGrowthMult: 1.2, label: '+20% crop growth' } },
  { id: 'ev_honeybee_days', name: 'Honeybee Harvest Days', blurb: 'The bees are busy and the blossoms are buzzing — crops grow lush and fast.', emoji: '🐝', effect: { cropGrowthMult: 1.3, label: '+30% crop growth' } },
  { id: 'ev_frost_fair', name: 'First Frost Fair', blurb: 'A sparkling frost dusts the valley — ice-kissed crops sell for a fortune!', emoji: '❄️', effect: { cropValueMult: 1.5, label: '+50% crop sale value' } },
];

const NEUTRAL_EFFECT: EventEffect = { label: '' };

// The festival active on a given in-game day (1-based). Cycles forever.
export function eventForDay(day: number): ValleyEvent {
  const d = Math.max(1, Math.floor(day || 1));
  return EVENTS[(d - 1) % EVENTS.length];
}

// The gameplay effect active on a given in-game day.
export function eventEffectForDay(day: number): EventEffect {
  return eventForDay(day).effect ?? NEUTRAL_EFFECT;
}
