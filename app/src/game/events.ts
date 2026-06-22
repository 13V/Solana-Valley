// Seasonal festivals — a rotating "what's happening in the valley" banner.
// One festival is active per in-game day, cycling through the list. Flavor /
// hype for now (no mechanical effect wired); effects can hook in later by
// reading the active event id.
export type ValleyEvent = { id: string; name: string; blurb: string; emoji: string };

export const EVENTS: ValleyEvent[] = [
  { id: 'ev_spring_bloom', name: 'Spring Bloom Festival', blurb: 'The first flowers burst open — plant something rare and watch the valley wake up!', emoji: '🌸' },
  { id: 'ev_rain_dance', name: 'Rain Dance Jubilee', blurb: 'Storm clouds roll in and every watered crop feels a little friskier — dance in the puddles!', emoji: '🌧️' },
  { id: 'ev_golden_harvest', name: 'Golden Harvest Gala', blurb: 'Autumn gold blankets the valley — show off your fullest baskets and wear the harvest crown.', emoji: '🌾' },
  { id: 'ev_mutation_moon', name: 'Mutation Moon Night', blurb: 'A rare silver moon rises — stay up late and grow something truly extraordinary.', emoji: '🌕' },
  { id: 'ev_fishing_frenzy', name: "Fisher's Frenzy Week", blurb: 'The water teems with legendary catches — cast your line for rare fish and shimmering loot!', emoji: '🎣' },
  { id: 'ev_animal_fair', name: 'Valley Animal Fair', blurb: 'Your barn crew is the star today — pampered animals and proud ribbons all around!', emoji: '🐄' },
  { id: 'ev_forage_feast', name: "Forager's Feast", blurb: 'Wild mushrooms and herbs are everywhere this week — wander the grass and fill your basket!', emoji: '🍄' },
  { id: 'ev_starlight_market', name: 'Starlight Night Market', blurb: 'Lanterns light the valley under a blanket of stars — trade treasures past midnight.', emoji: '✨' },
  { id: 'ev_winter_solstice', name: 'Solstice Warmth Festival', blurb: 'The longest night calls for a big bonfire — gather round and share the harvest.', emoji: '🔥' },
  { id: 'ev_pumpkin_patch', name: 'Pumpkin Patch Parade', blurb: "Giant gourds roll in — carve, display, and crown the valley's most spectacular pumpkin!", emoji: '🎃' },
  { id: 'ev_rainbow_crop', name: 'Rainbow Crop Carnival', blurb: 'Prismatic mutations are in full bloom — rainbow crops are the toast of the town today!', emoji: '🌈' },
  { id: 'ev_seed_swap', name: 'Grand Seed Swap', blurb: "Bring your spares and trade for varieties you've never grown — the rarer the better!", emoji: '🌱' },
  { id: 'ev_honeybee_days', name: 'Honeybee Harvest Days', blurb: 'The bees are busy and the blossoms are buzzing — a sweet week for every gardener.', emoji: '🐝' },
  { id: 'ev_frost_fair', name: 'First Frost Fair', blurb: 'A sparkling frost dusts the valley — harvest ice-kissed crops before the thaw!', emoji: '❄️' },
];

// The festival active on a given in-game day (1-based). Cycles forever.
export function eventForDay(day: number): ValleyEvent {
  const d = Math.max(1, Math.floor(day || 1));
  return EVENTS[(d - 1) % EVENTS.length];
}
