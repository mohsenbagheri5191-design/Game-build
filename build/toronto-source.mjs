/**
 * Downtown Toronto — real geography source table.
 *
 * COORDINATE FRAME
 * ----------------
 * Everything is authored in the *Toronto downtown survey grid*, the frame the
 * city was actually laid out on. It is rotated from true north and it is very
 * slightly non-orthogonal (Yonge St, the meridian baseline, sits at a different
 * angle to the concession grid the east-west streets follow).
 *
 *   u  = metres along the east-west streets, +ve east.  0 = Yonge St.
 *   v  = metres along the north-south streets, +ve north. 0 = Front St.
 *
 * Origin is Yonge & Front (43.6455 N, 79.3778 W).
 *
 *   u axis bearing  = 72.8 deg  (17.2 deg north of true east)
 *   v axis bearing  = 345.8 deg (14.2 deg west of true north)
 *
 * The game world uses the grid frame directly (X = u, Z = -v) so that lots and
 * build slots are axis-aligned; true north and lat/lon are recovered with
 * gridToEN() / gridToLatLon() below.
 *
 * Street positions come from real intersection-to-intersection distances, so
 * the network's spacing and the block structure are the real ones. Named
 * landmarks are placed by the real intersection and quadrant they occupy, with
 * their real heights in metres.
 */

export const ORIGIN_LAT = 43.6455;
export const ORIGIN_LON = -79.3778;

// u-axis (east-west streets) and v-axis (north-south streets) tilts.
const TH_U = (17.2 * Math.PI) / 180;
const TH_V = (14.2 * Math.PI) / 180;
export const GRID_ROT_DEG = 17.2;

const UC = Math.cos(TH_U), US = Math.sin(TH_U);
const VC = Math.cos(TH_V), VS = Math.sin(TH_V);

/** Grid (u,v) metres -> local (east,north) metres from the origin. */
export function gridToEN(u, v) {
  return { e: u * UC - v * VS, n: u * US + v * VC };
}

/** Grid (u,v) metres -> WGS84 latitude / longitude. */
export function gridToLatLon(u, v) {
  const { e, n } = gridToEN(u, v);
  const lat = ORIGIN_LAT + n / 111320;
  const lon = ORIGIN_LON + e / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat, lon };
}

// ---------------------------------------------------------------------------
// STREET CLASSES
// ---------------------------------------------------------------------------
// width is the full right-of-way in metres; lanes drive the road surface, the
// rest becomes sidewalk.
export const CLASS = {
  boulevard: { width: 45, rank: 5 },
  arterial:  { width: 22, rank: 4 },
  major:     { width: 20, rank: 3 },
  collector: { width: 16, rank: 2 },
  local:     { width: 12, rank: 1 },
  lane:      { width: 7,  rank: 0 },
};

// ---------------------------------------------------------------------------
// EAST-WEST STREETS  (constant v)
// ---------------------------------------------------------------------------
// [ name, v, uMin, uMax, class ]
// Toronto splits east-west street names at Yonge (Queen St W / Queen St E); the
// `split` flag marks the ones that do.
export const EW_STREETS = [
  ['Queens Quay',        -480, -1600,  1300, 'arterial', true],
  ['Lake Shore Blvd',    -330, -2350,  1650, 'boulevard', true],
  ['Gardiner Expressway',-268, -2350,  1650, 'expressway', false],
  ['Bremner Blvd',       -175, -1350,  -380, 'collector', false],
  ['The Esplanade',      -120,   -60,   980, 'local', false],
  ['Front St',              0, -1850,  1300, 'arterial', true],
  ['Piper St',             80,  -260,   -60, 'lane', false],
  ['Wellington St',       150, -1560,   950, 'collector', true],
  ['Mercer St',           235, -1300, -1000, 'local', false],
  ['Stewart St',          250, -1560, -1320, 'local', false],
  ['Melinda St',          255,  -380,  -120, 'lane', false],
  ['Colborne St',         265,   -40,   260, 'lane', false],
  ['King St',             350, -2050,  1350, 'arterial', true],
  ['Pearl St',            445, -1120,  -760, 'local', false],
  ['Adelaide St',         500, -1950,  1300, 'major', true],
  ['Nelson St',           505, -1080,  -840, 'lane', false],
  ['Temperance St',       560,  -320,   -80, 'lane', false],
  ['Camden St',           565, -1420, -1200, 'local', false],
  ['Richmond St',         610, -1950,  1300, 'major', true],
  ['Sullivan St',         720, -1340, -1080, 'local', false],
  ['Queen St',            810, -2350,  1500, 'arterial', true],
  ['Britain St',          900,   560,   820, 'lane', false],
  ['Shuter St',           950,   -80,  1300, 'collector', false],
  ['Lombard St',          960,   100,   620, 'local', false],
  ['Richmond Hill Lane', 1010,  -700,  -520, 'lane', false],
  ['Edward St',          1120,  -470,   -20, 'local', false],
  ['Albert St',          1120,  -460,   100, 'local', false],
  ['Dundas St',          1210, -2350,  1550, 'arterial', true],
  ['Dalhousie Lane',     1270,   340,   470, 'lane', false],
  ['Gould St',           1300,   100,   420, 'local', false],
  ['Elm St',             1310,  -520,    40, 'local', false],
  ['Baldwin St',         1330, -1020,  -620, 'local', false],
  ['Granby St',          1360,   200,   520, 'local', false],
  ['McGill St',          1420,   140,   560, 'local', false],
  ['Cecil St',           1450, -1020,  -660, 'local', false],
  ['Oxford St',          1500, -1520, -1230, 'local', false],
  ['Gerrard St',         1540,  -940,  1550, 'major', true],
  ['Nassau St',          1560, -1580, -1270, 'local', false],
  ['Carlton St',         1870,     0,  1550, 'major', false],
  ['College St',         1870, -2350,     0, 'major', false],
  ['Grosvenor St',       1990,  -540,  -120, 'local', false],
  ['Breadalbane St',     2060,  -380,   -80, 'local', false],
  ['Wellesley St',       2210,  -860,  1400, 'collector', true],
  ['Alexander St',       2300,    90,   380, 'local', false],
  ['Maitland St',        2350,    40,   620, 'local', false],
  ['Dundonald St',       2450,   100,   360, 'local', false],
  ['Gloucester St',      2600,   140,   520, 'local', false],
  ['St Mary St',         2620,  -420,   -80, 'local', false],
  ['Isabella St',        2660,   180,   620, 'local', false],
  ['St Joseph St',       2700,  -440,   100, 'local', false],
  ['Charles St',         2790,  -700,   700, 'local', true],
  ['Bloor St',           2910, -2350,  1500, 'arterial', true],
];

// ---------------------------------------------------------------------------
// NORTH-SOUTH STREETS  (constant u)
// ---------------------------------------------------------------------------
// [ name, u, vMin, vMax, class ]
export const NS_STREETS = [
  ['Bathurst St',      -2012,  -400, 3000, 'arterial'],
  ['Niagara St',       -1880,   250,  480, 'local'],
  ['Portland St',      -1700,   180,  820, 'local'],
  ['Brant St',         -1620,   180,  360, 'lane'],
  ['Denison Ave',      -1600,   820, 1600, 'local'],
  ['Bellevue Ave',     -1540,   820, 1350, 'local'],
  ['Augusta Ave',      -1500,  1150, 1600, 'local'],
  ['Kensington Ave',   -1450,  1220, 1560, 'local'],
  ['Spadina Ave',      -1414,  -420, 3000, 'boulevard'],
  ['Draper St',        -1340,   180,  300, 'lane'],
  ['Charlotte St',     -1250,   350,  620, 'local'],
  ['Peter St',         -1180,  -180,  820, 'collector'],
  ['Widmer St',        -1090,   440,  820, 'local'],
  ['John St',          -1010,  -220, 1350, 'collector'],
  ['Ed Mirvish Way',    -900,   350,  620, 'local'],
  ['Beverley St',       -950,   820, 1880, 'local'],
  ['Simcoe St',         -840,  -220, 1250, 'collector'],
  ['McCaul St',         -800,   820, 1880, 'collector'],
  ['St Patrick St',     -760,   820, 1220, 'local'],
  ['University Ave',    -660,     0, 1880, 'boulevard'],
  ['Queens Park Cres',  -660,  1880, 2950, 'boulevard'],
  ['Huron St',         -1080,  1560, 3000, 'local'],
  ['Chestnut St',       -560,   950, 1350, 'local'],
  ['Centre Ave',        -500,   820, 1150, 'local'],
  ['York St',           -440,  -300,  820, 'collector'],
  ['Elizabeth St',      -420,   950, 1560, 'local'],
  ['Bay St',            -240,  -360, 3000, 'arterial'],
  ['Yonge St',             0,  -340, 3000, 'arterial'],
  ['Victoria St',        120,   350, 1350, 'local'],
  ['Church St',          228,     0, 3000, 'major'],
  ['Bond St',            310,   810, 1560, 'local'],
  ['Dalhousie St',       390,   950, 1300, 'local'],
  ['Mutual St',          470,   950, 2350, 'local'],
  ['Jarvis St',          546,  -160, 3000, 'arterial'],
  ['George St',          660,   150, 1600, 'local'],
  ['Frederick St',       700,   150,  480, 'local'],
  ['Sherbourne St',      792,  -160, 3000, 'arterial'],
  ['Ontario St',         900,   350, 1600, 'local'],
  ['Berkeley St',        990,     0,  620, 'local'],
  ['Seaton St',          980,  1210, 2000, 'local'],
  ['Parliament St',     1220,  -280, 3000, 'arterial'],
  ['Sackville St',      1360,   350, 2000, 'local'],
  ['River St',          1480,   810, 2000, 'collector'],
  ['Bayview Ave',       1600,  -300, 2000, 'arterial'],
];

// ---------------------------------------------------------------------------
// PLAYABLE AREA
// ---------------------------------------------------------------------------
export const BOUNDS = { uMin: -2350, uMax: 1650, vMin: -620, vMax: 3000 };

// ---------------------------------------------------------------------------
// WATER + RAIL  (not buildable)
// ---------------------------------------------------------------------------
export const WATER = [
  {
    name: 'Toronto Harbour',
    kind: 'lake',
    // Lake Ontario. The northern edge follows Queens Quay with the real slip
    // cut-outs; the rest runs well past the playable area so that looking
    // south from the city you see open water rather than the edge of a plate.
    poly: [
      [-6000, -3400], [6000, -3400], [6000, -540], [900, -540],
      [880, -500], [780, -500], [770, -540], [200, -540],
      [190, -500], [90, -500], [80, -540], [-520, -540],
      [-530, -490], [-640, -490], [-650, -540], [-1180, -540],
      [-1190, -500], [-1300, -500], [-1310, -540], [-6000, -540],
    ],
  },
  {
    name: 'Don River',
    kind: 'river',
    poly: [
      [1560, -300], [1650, -300], [1650, 2000], [1540, 2000],
      [1500, 1500], [1520, 900], [1560, 400],
    ],
  },
  // --- Toronto Islands: the foreground of every skyline photo ever taken ---
  {
    name: "Hanlan's Point",
    kind: 'island',
    poly: [[-1620, -1500], [-1180, -1560], [-1060, -1380], [-1120, -1120], [-1420, -1060], [-1640, -1180]],
  },
  {
    name: 'Billy Bishop Airport',
    kind: 'island',
    poly: [[-1500, -1060], [-1000, -1010], [-980, -880], [-1480, -900]],
  },
  {
    name: 'Centre Island',
    kind: 'island',
    poly: [[-1060, -1420], [-460, -1520], [-300, -1360], [-380, -1140], [-1000, -1100]],
  },
  {
    name: "Ward's Island",
    kind: 'island',
    poly: [[-300, -1380], [340, -1440], [520, -1280], [400, -1080], [-260, -1120]],
  },
  {
    name: 'Algonquin Island',
    kind: 'island',
    poly: [[-420, -1100], [-60, -1130], [-40, -1010], [-400, -990]],
  },
];

// The rail corridor into Union Station — a hard barrier across downtown.
export const RAIL_CORRIDOR = {
  name: 'Union Station Rail Corridor',
  poly: [
    [-2350, -250], [-1350, -250], [-1000, -215], [-520, -190],
    [-460, -175], [-140, -175], [-60, -190], [400, -215],
    [1100, -240], [1650, -250],
    [1650, -110], [1100, -100], [400, -80], [-60, -60],
    [-460, -40], [-520, -55], [-1000, -80], [-1350, -110], [-2350, -110],
  ],
};

// ---------------------------------------------------------------------------
// PARKS AND PUBLIC SQUARES  (not buildable)
// ---------------------------------------------------------------------------
// [ name, uMin, vMin, uMax, vMax, kind ]
export const PARKS = [
  ['Nathan Phillips Square', -430,  820,  -250,  980, 'square'],
  ["Queen's Park",           -790, 1990,  -540, 2600, 'park'],
  ['Allan Gardens',           620, 1560,   800, 1760, 'park'],
  ['Moss Park',               600,  950,   800, 1140, 'park'],
  ['Grange Park',            -930,  960,  -790, 1120, 'park'],
  ['Berczy Park',             170,   40,   280,  130, 'square'],
  ['St James Park',           250,  360,   400,  470, 'park'],
  ['David Pecaut Square',    -930,  180,  -840,  280, 'square'],
  ['Clarence Square',       -1330,  200, -1240,  280, 'square'],
  ['Victoria Memorial Sq',  -1790,  380, -1700,  460, 'square'],
  ['Roundhouse Park',       -1010, -230,  -790, -120, 'park'],
  ['HTO Park',               -920, -560,  -760, -480, 'park'],
  ['Harbour Square Park',    -560, -560,  -420, -480, 'park'],
  ['Toronto Music Garden',  -1600, -560, -1430, -480, 'park'],
  ['Little Norway Park',    -1300, -560, -1180, -480, 'park'],
  ['Canoe Landing Park',    -1330, -250, -1180, -180, 'park'],
  ['Sculpture Gardens',       250,  240,   330,  310, 'square'],
  ['Cloud Gardens',          -110,  560,   -40,  620, 'square'],
  ['Simcoe Park',            -820,  -50,  -760,   20, 'park'],
  ['Metro Hall Square',      -900,  260,  -840,  330, 'square'],
  ['Osgoode Hall',           -660,  820,  -520,  950, 'park'],
  ['College Park',           -190, 1740,   -60, 1860, 'park'],
  ['Barbara Hall Park',       180, 2210,   290, 2320, 'park'],
  ['George Hislop Park',      140, 2660,   210, 2900, 'park'],
  ['Alexandra Park',        -1620,  620, -1470,  800, 'park'],
  ["St Andrew's Playground",-1450,  820, -1350,  920, 'park'],
  ['Trinity Bellwoods',     -2350,  700, -2100, 1300, 'park'],
  ['Regent Park',            1000, 1210,  1200, 1450, 'park'],
  ['Corktown Common',        1380,  300,  1560,  470, 'park'],
  ['Sherbourne Common',       700, -560,   800, -480, 'park'],
  ['Riverdale Park West',    1480,  980,  1600, 1400, 'park'],
  ['Joseph Sheard Parkette', -400, 2060,  -330, 2130, 'square'],
  ['Norman Jewison Park',     240, 1420,   310, 1490, 'square'],
  ['Winchester Square',      1000, 1900,  1080, 1980, 'square'],
  ['Sugar Beach',             340, -560,   440, -480, 'park'],
];

// ---------------------------------------------------------------------------
// NAMED LANDMARK BUILDINGS  (real footprints in the grid, real heights)
// ---------------------------------------------------------------------------
// [ name, uMin, vMin, uMax, vMax, heightM, form ]
// form: 'tower' | 'slab' | 'podium' | 'dome' | 'hall' | 'shed' | 'spire'
export const LANDMARKS = [
  // --- Financial District ---
  ['First Canadian Place',   -430,  360, -290,  490, 298, 'tower'],
  ['Scotia Plaza',           -190,  380,  -70,  490, 275, 'tower'],
  ['TD Bank Tower',          -420,  200, -320,  310, 223, 'tower'],
  ['TD North Tower',         -300,  210, -220,  300, 189, 'tower'],
  ['TD West Tower',          -430,  120, -350,  195, 174, 'tower'],
  ['Commerce Court West',    -200,  190,  -90,  300, 239, 'tower'],
  ['Commerce Court North',    -90,  200,   -8,  290,  34, 'podium'],
  ['Royal Bank Plaza South', -420,   20, -330,  110, 180, 'tower'],
  ['Royal Bank Plaza North', -320,   30, -250,  120, 142, 'tower'],
  ['Brookfield Place',       -200,   30,  -90,  130, 261, 'tower'],
  ['TD Canada Trust Tower',   -80,   30,    5,  130, 261, 'tower'],
  ['Bay Adelaide West',      -170,  520,  -70,  600, 218, 'tower'],
  ['Bay Adelaide East',       -60,  520,   30,  600, 209, 'tower'],
  ['EY Tower',                 40,  520,  130,  600, 208, 'tower'],
  ['The St. Regis Toronto',  -230,  505, -170,  590, 277, 'spire'],
  ['One King West',            10,  360,   70,  430, 176, 'spire'],
  ['Richmond-Adelaide Ctr',  -350,  520, -240,  600, 130, 'slab'],
  ['Sun Life Centre',        -560,  360, -470,  480, 120, 'slab'],
  ['Simcoe Place',           -790,  200, -700,  310, 134, 'tower'],

  // --- Entertainment District + waterfront ---
  ['CN Tower',               -840, -110, -782,  -52, 553, 'cntower'],
  ['Rogers Centre',         -1160, -240, -930,  -30,  86, 'dome'],
  ["Ripley's Aquarium",      -940, -190, -830, -120,  20, 'hall'],
  ['Roundhouse',            -1010, -230,  -830, -170, 14, 'shed'],
  ['Scotiabank Arena',       -430, -175,  -250,  -50, 40, 'hall'],
  ['Union Station',          -430,  -60,  -180,    0, 30, 'hall'],
  ['Fairmont Royal York',    -430,   10,  -250,  120,124, 'slab'],
  ['CBC Broadcast Centre',  -1060,   20,  -880,  140, 60, 'slab'],
  ['Metro Hall',            -1010,  200,  -910,  310,122, 'tower'],
  ['Roy Thomson Hall',       -900,  200,  -800,  300, 30, 'hall'],
  ['Princess of Wales',      -1090, 360, -1010,  430, 24, 'hall'],
  ['Royal Alexandra',        -1000, 360,  -930,  420, 22, 'hall'],
  ['Ice Condos East',       -1120, -160, -1060,  -60,203, 'tower'],
  ['Ice Condos West',       -1190, -160, -1130,  -60,234, 'tower'],
  ['Harbour Plaza East',     -520, -300,  -450, -200,232, 'tower'],
  ['Harbour Plaza West',     -610, -300,  -540, -200,224, 'tower'],
  ['Ten York',               -470, -320,  -400, -230,224, 'tower'],
  ['Pinnacle One Yonge',      -20, -300,    60, -200,318, 'tower'],
  ['L Tower',                -140, -120,   -70,  -40,205, 'spire'],
  ['Aqualina at Bayside',     300, -520,   380, -450, 55, 'slab'],

  // --- Yonge / Dundas / Bloor spine ---
  ['CF Toronto Eaton Centre',-230,  820,  -20, 1200,  45, 'hall'],
  ['Toronto City Hall East', -300,  830,  -262, 980,  99, 'cityhall'],
  ['Toronto City Hall West', -400,  840,  -362, 970,  79, 'cityhall'],
  ['Old City Hall',          -230,  830,  -110, 940,  45, 'clocktower'],
  ['Aura at College Park',   -180, 1740,   -70, 1850, 272, 'tower'],
  ['One Bloor East',           20, 2790,   120, 2900, 257, 'tower'],
  ['Massey Tower',             10,  810,    70,  880, 207, 'spire'],
  ['Maple Leaf Gardens',      240, 1880,   380, 1990,  30, 'hall'],
  ['Toronto Reference Lib.',   30, 2790,   140, 2900,  40, 'hall'],
  ['Manulife Centre',        -240, 2800,  -110, 2900, 168, 'slab'],
  ['Hudson Bay Centre',        20, 2800,   140, 2895, 120, 'slab'],
  ['Ryerson Student Centre',  100, 1300,   180, 1370,  30, 'hall'],
  ['Atrium on Bay',          -230, 1210,  -110, 1300,  60, 'podium'],

  // --- Civic / cultural / east ---
  ['Art Gallery of Ontario', -930, 1120,  -790, 1230,  35, 'hall'],
  ['Osgoode Hall Building',  -640,  860,  -560,  930,  22, 'hall'],
  ['Campbell House',         -680,  830,  -650,  865,  12, 'hall'],
  ['St James Cathedral',      240,  470,   320,  560,  93, 'church'],
  ['St Lawrence Market',      380,  110,   500,  230,  22, 'hall'],
  ['St Lawrence Hall',        300,  330,   380,  400,  26, 'hall'],
  ['Distillery District',    1180,  120,  1360,  300,  16, 'heritage'],
  ['Gooderham Building',      170,  120,   240,  190,  22, 'flatiron'],
  ['Cathedral Church of St James Park', 250, 360, 400, 470, 0, 'skip'],
  ['Metropolitan United',     240,  960,   330, 1050,  60, 'church'],
  ['Mackenzie House',         160,  980,   200, 1020,  12, 'hall'],
  ['Sony Centre',            -110,   20,   -10,  120,  30, 'hall'],
  ['Toronto Sculpture Gdn',   250,  240,   330,  310,   0, 'skip'],
  ['Regent Park Aquatic',    1010, 1250,  1090, 1330,  14, 'hall'],
  ['Corktown Distillery Silos',1150, 60,  1210,  120,  30, 'silo'],
];

// ---------------------------------------------------------------------------
// NAMED PLACES  (neighbourhoods, transit, civic — labels + search index)
// ---------------------------------------------------------------------------
// [ name, u, v, kind ]
export const PLACES = [
  ['Financial District',      -230,  360, 'neighbourhood'],
  ['Entertainment District',  -1000, 400, 'neighbourhood'],
  ['St Lawrence',              500,  200, 'neighbourhood'],
  ['Distillery District',     1250,  200, 'neighbourhood'],
  ['Corktown',                1100,  500, 'neighbourhood'],
  ['Old Town',                 350,  400, 'neighbourhood'],
  ['Church-Wellesley Village', 300, 2300, 'neighbourhood'],
  ['Yorkville',               -300, 2960, 'neighbourhood'],
  ['The Annex',              -1100, 2960, 'neighbourhood'],
  ['Kensington Market',      -1520, 1400, 'neighbourhood'],
  ['Chinatown',              -1250, 1300, 'neighbourhood'],
  ['Baldwin Village',         -840, 1330, 'neighbourhood'],
  ['Grange Park Village',     -900, 1000, 'neighbourhood'],
  ['Queen West',             -1600,  810, 'neighbourhood'],
  ['King West',              -1500,  350, 'neighbourhood'],
  ['Fashion District',       -1300,  560, 'neighbourhood'],
  ['Garment District',       -1150,  700, 'neighbourhood'],
  ['Harbourfront',            -700, -480, 'neighbourhood'],
  ['Bayside',                  350, -500, 'neighbourhood'],
  ['South Core',              -500, -200, 'neighbourhood'],
  ['Discovery District',      -560, 1600, 'neighbourhood'],
  ['Garden District',          200, 1200, 'neighbourhood'],
  ['Cabbagetown',             1050, 1900, 'neighbourhood'],
  ['Regent Park',             1100, 1330, 'neighbourhood'],
  ['Moss Park District',       650, 1050, 'neighbourhood'],
  ['Yonge-Dundas Square',      -60, 1180, 'square'],
  ['Union Station',           -300,  -30, 'transit'],
  ['St Andrew Station',       -640,  330, 'transit'],
  ['Osgoode Station',         -640,  800, 'transit'],
  ['St Patrick Station',      -640, 1200, 'transit'],
  ["Queen's Park Station",    -650, 1880, 'transit'],
  ['Museum Station',          -680, 2560, 'transit'],
  ['King Station',             -20,  340, 'transit'],
  ['Queen Station',            -20,  800, 'transit'],
  ['Dundas Station',           -20, 1200, 'transit'],
  ['College Station',          -20, 1860, 'transit'],
  ['Wellesley Station',        -20, 2200, 'transit'],
  ['Bloor-Yonge Station',      -10, 2900, 'transit'],
  ['Sherbourne Station',       780, 2900, 'transit'],
  ['Spadina Station',        -1400, 2960, 'transit'],
  ['St George Station',       -900, 2960, 'transit'],
  ['Bay Station',             -250, 2900, 'transit'],
  ['Spadina & King Streetcar',-1414, 350, 'transit'],
  ['Toronto City Hall',       -330,  900, 'civic'],
  ['Old City Hall Courts',    -170,  885, 'civic'],
  ['Ontario Legislature',     -660, 2300, 'civic'],
  ['Toronto Police HQ',       -300, 1450, 'civic'],
  ['Metro Toronto Convention',-880,  100, 'civic'],
  ['Toronto General Hospital',-540, 1660, 'civic'],
  ['SickKids Hospital',       -560, 1780, 'civic'],
  ['Mount Sinai Hospital',    -580, 1830, 'civic'],
  ['St Michaels Hospital',     150, 1000, 'civic'],
  ['Toronto Metropolitan Univ',180, 1350, 'school'],
  ['University of Toronto',   -900, 2400, 'school'],
  ['OCAD University',         -870, 1180, 'school'],
  ['Jarvis Collegiate',        600, 1600, 'school'],
  ['Central Tech',           -1900, 1900, 'school'],
  ['Ryerson Public School',    400, 1050, 'school'],
  ['Toronto Islands Ferry',   -280, -540, 'transit'],
  ['Billy Bishop Airport',   -1150, -600, 'transit'],
  ['Rogers Centre',          -1040, -140, 'landmark'],
  ['CN Tower',                -811,  -80, 'landmark'],
  ['Scotiabank Arena',        -340, -110, 'landmark'],
  ['CF Toronto Eaton Centre', -120, 1000, 'landmark'],
  ['St Lawrence Market',       440,  170, 'landmark'],
  ['Art Gallery of Ontario',  -860, 1170, 'landmark'],
  ['Nathan Phillips Square',  -340,  900, 'square'],
  ['Berczy Park',              225,   85, 'square'],
  ['Allan Gardens',            710, 1660, 'park'],
  ["Queen's Park",            -665, 2300, 'park'],
  ['Trinity Bellwoods Park',  -2200,1000, 'park'],
  ['Riverdale Park West',     1540, 1190, 'park'],
  ['Corktown Common',         1470,  385, 'park'],
  ['Sugar Beach',              390, -520, 'park'],
  ['HTO Park',                -840, -520, 'park'],
  ['Harbourfront Centre',     -560, -500, 'landmark'],
  ['Toronto Harbour',         -600, -600, 'water'],
  ['Don River',               1560,  800, 'water'],
];

// ---------------------------------------------------------------------------
// HEIGHT FIELD — how tall the city is, by district.
// ---------------------------------------------------------------------------
// The infill buildings between the named landmarks take their storey count from
// these overlapping influence zones, which is what gives the skyline its real
// shape: a hard spike in the Financial District, condo walls along the
// waterfront and Yonge, low brick everywhere west and east.
// [ u, v, radius, peakStoreys ]
export const HEIGHT_ZONES = [
  [-240,  350, 420, 46], // Financial District core
  [-240,  550, 380, 32], // Adelaide/Richmond
  [-300,   30, 340, 30], // Front St banks
  [-450, -180, 420, 44], // South Core condo cluster
  [-1050,-140, 400, 34], // CityPlace / Rogers Centre condos
  [-1400,-260, 380, 30], // Fort York / Bathurst condos
  [   50, -220, 340, 40], // Yonge waterfront condos
  [  400, -420, 380, 26], // Bayside
  [ -100,  900, 300, 22], // Queen/Yonge
  [  -60, 1200, 320, 30], // Yonge-Dundas
  [  -80, 1800, 340, 34], // College Park
  [   40, 2860, 340, 36], // Yonge-Bloor
  [ -280, 2860, 300, 26], // Bloor-Bay
  [  330, 2300, 280, 24], // Church-Wellesley
  [ -560, 1700, 260, 18], // Hospital row
  [-1200,  500, 320, 16], // King West mid-rise
  [-1500,  850, 300,  8], // Queen West low-rise
  [-1550, 1400, 320,  4], // Kensington Market
  [-1250, 1300, 280,  6], // Chinatown
  [ 1080, 1900, 300,  3], // Cabbagetown
  [ 1250,  200, 260,  4], // Distillery
  [  480,  180, 240,  6], // St Lawrence
  [  700, 1100, 300,  9], // Moss Park
  [ 1100, 1330, 280, 14], // Regent Park
  [ -900, 1150, 260,  7], // Grange / OCAD
  [-2100, 1000, 320,  3], // Trinity Bellwoods edge
  [ 1450,  400, 260,  8], // Corktown Common
  // Broad, low-intensity fabric zones. These stop the areas between the named
  // districts collapsing to bare Victorian scale — whether a parcel here
  // actually goes mid-rise is then decided by how big the parcel is.
  [ -400,  600, 950, 13], // central core fabric
  [ -900,  400, 850, 12], // west core fabric
  [  350,  700, 780, 10], // east core fabric
  [ -600, 1700, 700, 12], // hospital / university fabric
  [ -200, 2500, 700, 14], // Yonge north fabric
  [ -900, -200, 700, 16], // south core fabric
];

export const DEFAULT_STOREYS = 4;

// ---------------------------------------------------------------------------
// STREET-TREE / FURNITURE DENSITY BY CLASS
// ---------------------------------------------------------------------------
export const STREET_FURNITURE = {
  boulevard: { treeGap: 18, lamps: 30, bench: 90 },
  arterial:  { treeGap: 22, lamps: 34, bench: 110 },
  major:     { treeGap: 24, lamps: 38, bench: 130 },
  collector: { treeGap: 28, lamps: 46, bench: 170 },
  local:     { treeGap: 34, lamps: 60, bench: 0 },
  lane:      { treeGap: 0,  lamps: 0,  bench: 0 },
};
