/**
 * Every tunable number in the game. Nothing economic, spatial or progression
 * related is hardcoded anywhere else — if a number matters, it lives here.
 */

export const CONFIG = {
  version: 3,

  // --- the module grid -----------------------------------------------------
  grid: {
    // One module unit. Walls are one unit wide and one unit tall; floors are
    // one unit square. Every part in the kit is authored against this.
    unit: 2.5,
    wallThickness: 0.17,
    storeyHeight: 2.5,
    maxStoreys: 8,
    minStorey: -1,          // one basement level
    snapStrength: 1.0,      // 0..1, scaled by the settings slider
  },

  // --- economy -------------------------------------------------------------
  economy: {
    startingCredits: 2400,
    startingLevel: 1,

    // faucets
    placeReward: 3,             // per part placed — the largest single source
    placeRewardPerLevel: 0.4,
    visitReward: 18,            // someone visits your town
    tipReceived: 25,
    tipGiven: 6,                // giving pays a little too
    civicContribution: 14,
    dailyLogin: 120,
    milestoneBase: 260,

    // sinks
    lotBasePrice: 900,
    lotPriceGrowth: 1.85,       // each extra lot costs this much more
    lotUpkeepBase: 22,          // credits per in-game day
    lotUpkeepGrowth: 1.55,
    releaseRefund: 0.55,        // fraction of purchase price returned

    // refunds on erase
    refundGraceMs: 45000,       // full refund inside this window
    refundFull: 1.0,
    refundPartial: 0.55,

    // anti-farming
    tipDailyCap: 6,
    tipPerRecipientPerDay: 1,
    minPartsToBeTippable: 12,
    civicDailyCap: 5,
    civicUnlockLevel: 4,

    upkeepIntervalHours: 24,
    conditionStages: ['Pristine', 'Good', 'Worn', 'Neglected', 'Derelict'],
    conditionDecayPerMissedCharge: 1,
    conditionWarnAt: 1,
  },

  // --- progression ---------------------------------------------------------
  progression: {
    // XP comes only from building.
    xpPerPart: 6,
    xpPerNewPartType: 40,
    xpPerStorey: 30,
    // level N needs base * N^exp cumulative
    xpBase: 140,
    xpExp: 1.42,
    maxLevel: 30,
  },

  // --- world / time --------------------------------------------------------
  time: {
    // one in-game day per this many real minutes when not following the clock
    minutesPerGameDay: 24,
    defaultMode: 'clock',       // 'clock' | 'accelerated' | 'manual'
    defaultHour: 10.5,
  },

  // --- camera --------------------------------------------------------------
  camera: {
    minDist: 11,
    maxDist: 3400,
    homeDist: 46,
    homePitch: 0.75,
    // The establishing shot on a first run. Framing the starter lot at home
    // distance put a new player 46 m from a 17 m wall, looking at a blank
    // grey slab and an empty road — "this is the real downtown" over a view
    // that could be any alley anywhere. Open high and wide enough to read as
    // a city, and let the walkthrough fly down to the lot.
    introDist: 620,
    introPitch: 0.80,
    boundsMargin: 260,
  },

  // --- lots ----------------------------------------------------------------
  lots: {
    maxHeld: 8,
    // A starter site must be open enough that the first camera view shows
    // something — a lot boxed in by towers makes every angle useless.
    starterMinArea: 320,
    starterMaxArea: 1400,
    starterMaxNeighbourHeight: 17,
    starterSearchRadius: 1100,
  },

  // --- social sim ----------------------------------------------------------
  social: {
    neighbourCount: 24,
    friendSuggestions: 12,
  },

  // --- audio ---------------------------------------------------------------
  audio: {
    masterDefault: 0.7,
    musicDefault: 0.35,
    sfxDefault: 0.8,
  },
};

/** Cumulative XP needed to *reach* a level. */
export function xpForLevel(level) {
  const { xpBase, xpExp } = CONFIG.progression;
  if (level <= 1) return 0;
  let total = 0;
  for (let i = 2; i <= level; i++) total += Math.round(xpBase * Math.pow(i - 1, xpExp));
  return total;
}

export function levelForXp(xp) {
  const max = CONFIG.progression.maxLevel;
  for (let l = max; l >= 1; l--) if (xp >= xpForLevel(l)) return l;
  return 1;
}

/** Price of the player's next lot, given how many they already hold. */
export function lotPrice(held) {
  const e = CONFIG.economy;
  return Math.round(e.lotBasePrice * Math.pow(e.lotPriceGrowth, held));
}

export function lotUpkeep(index) {
  const e = CONFIG.economy;
  return Math.round(e.lotUpkeepBase * Math.pow(e.lotUpkeepGrowth, index));
}
