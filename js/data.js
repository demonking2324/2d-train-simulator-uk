/* 2D Train Simulator UK - route data: Bournemouth to Edinburgh Haymarket */
(function () {
  'use strict';
  const RS = window.RS = {};

  RS.MILE = 1609.344;
  RS.MPH = 0.44704;
  // Platform geometry relative to a station's stop mark (metres)
  RS.PLAT = { back: 190, front: 12 };

  // style: brick | modern | shed | under      town: biome used around the station
  // throat: speed restriction (mph) through the station area
  RS.STATIONS = [
    { name: 'Bournemouth', style: 'shed', town: 'coast' },
    { name: 'Southampton Central', style: 'modern', town: 'urban' },
    { name: 'Winchester', style: 'brick', town: 'suburb' },
    { name: 'Basingstoke', style: 'brick', town: 'suburb' },
    { name: 'Reading', style: 'modern', town: 'urban', throat: 50 },
    { name: 'Oxford', style: 'modern', town: 'suburb' },
    { name: 'Leamington Spa', style: 'brick', town: 'suburb' },
    { name: 'Coventry', style: 'modern', town: 'urban' },
    { name: 'Birmingham International', style: 'modern', town: 'suburb' },
    { name: 'Birmingham New Street', style: 'under', town: 'urban', throat: 30 },
    { name: 'Derby', style: 'modern', town: 'urban', throat: 50 },
    { name: 'Chesterfield', style: 'brick', town: 'suburb' },
    { name: 'Sheffield', style: 'brick', town: 'urban', throat: 40 },
    { name: 'Doncaster', style: 'brick', town: 'urban', throat: 60 },
    { name: 'York', style: 'shed', town: 'urban', throat: 40 },
    { name: 'Darlington', style: 'shed', town: 'suburb' },
    { name: 'Durham', style: 'brick', town: 'suburb' },
    { name: 'Newcastle', style: 'shed', town: 'urban', throat: 30 },
    { name: 'Edinburgh Waverley', style: 'shed', town: 'urban', throat: 30 },
    { name: 'Haymarket', style: 'modern', town: 'urban' }
  ];

  // LEGS[i] runs from STATIONS[i] to STATIONS[i + 1].
  // miles: approximate real distance     mph: line speed
  // biomes: scenery types spread evenly along the leg
  // ole: overhead wires (true or [fromFrac, toFrac])     third: third-rail electrification
  // slows: temporary lower limits     features: tunnels / viaducts     landmarks: things to spot
  RS.LEGS = [
    { miles: 28.8, mph: 90, third: true, biomes: ['coast', 'forest', 'forest', 'forest', 'suburb'],
      landmarks: [{ at: 0.92, type: 'cranes', label: 'Southampton Docks' }] },
    { miles: 12.7, mph: 90, third: true, biomes: ['urban', 'farmland', 'downs'],
      features: [{ at: 0.1, type: 'tunnel', len: 400, name: 'Southampton Tunnel' }],
      landmarks: [{ at: 0.93, type: 'cathedral', label: 'Winchester Cathedral' }] },
    { miles: 18.8, mph: 100, third: true, biomes: ['downs', 'downs', 'farmland'],
      features: [{ at: 0.4, type: 'tunnel', len: 350, name: 'Popham Tunnels' }] },
    { miles: 15.5, mph: 75, biomes: ['farmland', 'farmland', 'suburb'] },
    { miles: 27.4, mph: 100, ole: [0, 0.6], biomes: ['suburb', 'farmland', 'farmland', 'suburb'],
      features: [{ at: 0.3, type: 'viaduct', len: 170, name: 'Gatehampton Bridge (River Thames)' }],
      landmarks: [{ at: 0.94, type: 'spires', label: 'The dreaming spires of Oxford' }] },
    { miles: 42.5, mph: 100, biomes: ['farmland', 'farmland', 'downs', 'farmland', 'suburb'],
      slows: [{ at: 0.53, len: 500, mph: 60 }],
      features: [{ at: 0.78, type: 'tunnel', len: 250, name: 'Harbury Tunnel' }] },
    { miles: 9.5, mph: 70, biomes: ['farmland', 'farmland', 'suburb'] },
    { miles: 10.5, mph: 100, ole: true, biomes: ['urban', 'farmland', 'suburb'] },
    { miles: 8.5, mph: 90, ole: true, biomes: ['suburb', 'urban', 'industrial', 'urban'],
      features: [{ at: 0.9, type: 'tunnel', len: 320, name: 'New Street South Tunnel' }],
      landmarks: [{ at: 0.72, type: 'rotunda', label: 'Birmingham skyline' }] },
    { miles: 41.3, mph: 110, biomes: ['urban', 'industrial', 'farmland', 'farmland', 'suburb'],
      features: [{ at: 0.03, type: 'tunnel', len: 300, name: 'New Street North Tunnel' }],
      landmarks: [{ at: 0.72, type: 'cooling', label: 'Willington cooling towers' }] },
    { miles: 24.0, mph: 100, biomes: ['suburb', 'farmland', 'hills', 'hills'],
      features: [{ at: 0.3, type: 'tunnel', len: 450, name: 'Milford Tunnel' },
                 { at: 0.66, type: 'tunnel', len: 550, name: 'Clay Cross Tunnel' }],
      landmarks: [{ at: 0.95, type: 'spire', label: 'The Crooked Spire, Chesterfield' }] },
    { miles: 12.3, mph: 70, biomes: ['hills', 'hills', 'urban'],
      features: [{ at: 0.5, type: 'tunnel', len: 600, name: 'Bradway Tunnel' }] },
    { miles: 18.5, mph: 80, biomes: ['industrial', 'urban', 'farmland', 'suburb'] },
    { miles: 32.2, mph: 125, ole: true, biomes: ['farmland', 'farmland', 'farmland', 'suburb'],
      landmarks: [{ at: 0.35, type: 'cooling', label: 'Aire Valley power stations' },
                  { at: 0.96, type: 'minster', label: 'York Minster' }] },
    { miles: 44.1, mph: 125, ole: true, biomes: ['farmland', 'farmland', 'farmland'],
      landmarks: [{ at: 0.45, type: 'whitehorse', label: 'Kilburn White Horse' }] },
    { miles: 22.0, mph: 115, ole: true, biomes: ['farmland', 'hills', 'suburb'],
      features: [{ at: 0.93, type: 'viaduct', len: 240, name: 'Durham Viaduct' }],
      landmarks: [{ at: 0.95, type: 'cathedral', label: 'Durham Cathedral' }] },
    { miles: 14.5, mph: 90, ole: true, biomes: ['suburb', 'farmland', 'industrial', 'urban'],
      features: [{ at: 0.93, type: 'viaduct', len: 350, name: 'King Edward VII Bridge (River Tyne)' }],
      landmarks: [{ at: 0.6, type: 'angel', label: 'Angel of the North' },
                  { at: 0.93, type: 'archbridge', label: 'Tyne Bridge' }] },
    { miles: 124.4, mph: 125, ole: true,
      biomes: ['urban', 'farmland', 'farmland', 'coast', 'coast', 'farmland', 'coast', 'hills', 'coast', 'farmland', 'urban'],
      slows: [{ at: 0.13, len: 700, mph: 50 }, { at: 0.54, len: 900, mph: 60 }],
      features: [{ at: 0.54, type: 'viaduct', len: 600, name: 'Royal Border Bridge (River Tweed)' }],
      landmarks: [{ at: 0.42, type: 'island', label: 'Lindisfarne (Holy Island)' },
                  { at: 0.8, type: 'bassrock', label: 'Bass Rock' },
                  { at: 0.965, type: 'arthur', label: "Arthur's Seat" }] },
    { miles: 1.2, mph: 40, ole: true, biomes: ['urban'],
      features: [{ at: 0.55, type: 'tunnel', len: 500, name: 'The Mound & Haymarket Tunnels' }],
      landmarks: [{ at: 0.2, type: 'castle', label: 'Edinburgh Castle' }] }
  ];

  // Running lines on each leg (approximate): mostly double track, four tracks out of Reading,
  // York and Edinburgh Waverley, and a single line between Leamington Spa and Coventry
  [2, 2, 2, 2, 4, 2, 1, 2, 2, 2, 2, 2, 2, 2, 4, 2, 2, 2, 4].forEach((n, i) => { RS.LEGS[i].tracks = n; });

  RS.MISSIONS = [
    { id: 'm1', title: 'South Coast Starter', from: 0, to: 4,
      blurb: 'Leave the seaside at dawn, cross the New Forest and climb over the Hampshire downs to Reading.' },
    { id: 'm2', title: 'Thames to the Midlands', from: 4, to: 9,
      blurb: 'Up the Thames Valley past Oxford\'s spires, then under the wires into Birmingham New Street.' },
    { id: 'm3', title: 'Heart of England', from: 9, to: 14,
      blurb: 'Out through the New Street tunnels, past the Crooked Spire and steel city to York.' },
    { id: 'm4', title: 'East Coast Racetrack', from: 14, to: 17,
      blurb: '125 mph running on the East Coast Main Line, over Durham Viaduct and the Tyne.' },
    { id: 'm5', title: 'Over the Border', from: 17, to: 19,
      blurb: 'The Northumberland coast, the Royal Border Bridge and an evening arrival in Edinburgh.' },
    { id: 'full', title: 'The Full Run', from: 0, to: 19, full: true,
      blurb: 'All 20 stations, Bournemouth to Edinburgh Haymarket, dawn to dusk.' }
  ];

  // ---------- Victoria line: Walthamstow Central to Brixton, underground throughout ----------
  // [station, km to the next station] - approximate real distances
  const VIC = [
    ['Walthamstow Central', 1.45], ['Blackhorse Road', 1.45], ['Tottenham Hale', 1.0], ['Seven Sisters', 3.15],
    ['Finsbury Park', 1.95], ['Highbury & Islington', 2.4], ["King's Cross St. Pancras", 0.75], ['Euston', 0.75],
    ['Warren Street', 0.9], ['Oxford Circus', 1.1], ['Green Park', 1.15], ['Victoria', 1.2], ['Pimlico', 0.85],
    ['Vauxhall', 1.6], ['Stockwell', 1.5], ['Brixton', 0]
  ];
  const vicLegs = VIC.slice(0, -1).map(v => ({ miles: v[1] / 1.609344, mph: 50, tracks: 1, biomes: ['urban'] }));
  const sights = [
    [2, 0.7, 'spurs', 'Tottenham Hotspur Stadium'], [4, 0.45, 'emirates', "Arsenal's Emirates Stadium"],
    [5, 0.9, 'stpancras', 'St Pancras station'], [7, 0.7, 'bttower', 'The BT Tower'],
    [10, 0.5, 'palace', 'Buckingham Palace'], [11, 0.15, 'wcathedral', 'Westminster Cathedral'],
    [12, 0.2, 'battersea', 'Battersea Power Station'], [13, 0.12, 'mi6', 'The MI6 building at Vauxhall Cross']
  ];
  for (const [leg, at, type, label] of sights) vicLegs[leg].landmarks = [{ at, type, label }];
  vicLegs[12].features = [{ at: 0.5, type: 'river', len: 240, name: 'Passing under the River Thames' }];

  // Sprite rectangles in each train image. doors: x ranges within the car; dt / dh: door top and height.
  // cars are listed rear first. flip mirrors a car so its cab faces backwards.
  const xcCar = (x, y, w, h, doors) => ({ x, y, w, h, doors, dt: h - 62, dh: 38 });
  const tubeCar = (w, flip) => ({ x: 20, y: 130, w, h: 112, flip, doors: [[6, 53], [160, 252], [361, 455]], dt: 8, dh: 74 });
  const tubeMid = tubeCar(615, false);

  // scale: fraction of the real distance     minLeg: shortest allowed leg (m)     tod: clock hours at each end
  RS.ROUTES = [
    { id: 'xc', tab: 'CrossCountry', sub: 'Bournemouth to Edinburgh Haymarket',
      welcome: 'Welcome aboard this CrossCountry service to {d}.',
      stations: RS.STATIONS, legs: RS.LEGS, missions: RS.MISSIONS, unlock: [0, 1, 3, 5, 7, 10],
      scale: 0.1, minLeg: 1800, tod: [6.4, 21], weather: true, traffic: true,
      train: { img: 'assets/train.png', spr: 19.23, couple: 2, dial: 140, vmax: 125, aMax: 0.85, pm: 13, brake: [0, 0.3, 0.6, 0.9],
        consists: [[0, 1, 2, 3, 4], [0, 1, 3, 4]],
        cars: [
          xcCar(25, 30, 450, 75, [[128, 143], [403, 419]]), xcCar(24, 120, 451, 76, [[30, 48], [395, 412]]),
          xcCar(25, 210, 450, 77, [[32, 49], [395, 412]]), xcCar(25, 300, 450, 78, [[31, 48], [395, 412]]),
          xcCar(25, 392, 449, 75, [[29, 46], [305, 321]])
        ] } },
    { id: 'vic', tab: 'Tube: Victoria line', sub: 'Walthamstow Central to Brixton', tube: true,
      welcome: 'This is a Victoria line train to {d}.',
      stations: VIC.map(v => ({ name: v[0], style: 'tube', town: 'urban' })), legs: vicLegs, unlock: [0, 1, 3, 5],
      missions: [
        { id: 'v1', title: 'Out of Walthamstow', from: 0, to: 4,
          blurb: 'Learn the tube train on the north-eastern end of the line, including the long run to Finsbury Park.' },
        { id: 'v2', title: 'Into the West End', from: 4, to: 9,
          blurb: "Under Islington to King's Cross and Euston, then quick hops to Oxford Circus." },
        { id: 'v3', title: 'Under the Thames', from: 9, to: 15,
          blurb: 'Green Park and Victoria, beneath the river at Vauxhall and on to Brixton.' },
        { id: 'vfull', title: 'End to End', from: 0, to: 15, full: true,
          blurb: 'All 16 stations, Walthamstow Central to Brixton.' }
      ],
      scale: 1, minLeg: 600, tod: [10.5, 11.05], weather: false, traffic: false,
      train: { img: 'assets/tube.png', spr: 38, couple: 0, dial: 70, vmax: 50, aMax: 1.2, pm: 11, brake: [0, 0.4, 0.8, 1.15],
        cars: [tubeCar(650, true), tubeMid, tubeMid, tubeMid, tubeMid, tubeMid, tubeMid, tubeCar(650, false)] } }
  ];

  // ---------- Freight: an oil train over the CrossCountry line from the Southampton area to Birmingham ----------
  // It runs non-stop past the passenger stations and only halts at the far end.
  const yard = name => ({ name, style: 'yard', town: 'industrial' });
  const loco = { img: 'assets/loco.png', x: 0, y: 0, w: 1155, h: 216, spr: 54, doors: [], dark: true };
  const tank = { img: 'assets/tanker.png', x: 76, y: 177, w: 329, h: 119, spr: 30.5, doors: [], dark: true };
  RS.ROUTES.push({
    id: 'oil', tab: 'Freight: oil tankers', sub: 'Fawley Refinery to Washwood Heath', nonstop: true,
    welcome: 'Oil train to {d}. No stops on the way, and 60 mph at most.',
    welcomeBack: 'Empty tankers to {d}. No stops on the way. The train is light, so it pulls away and stops more quickly.',
    stations: [yard('Fawley Refinery')].concat(RS.STATIONS.slice(2, 9).map(s => Object.assign({}, s)), [yard('Washwood Heath Yard')]),
    legs: RS.LEGS.slice(1, 9), unlock: [0, 1, 3],
    missions: [
      { id: 'f1', title: 'Refinery to Reading', from: 0, to: 3,
        blurb: 'Get a heavy train of loaded tankers moving, then over the Hampshire downs to Reading.' },
      { id: 'f2', title: 'Thames Valley to the Midlands', from: 3, to: 8,
        blurb: 'Through Oxford and Leamington Spa, along the single line to Coventry and into the yard.' },
      { id: 'ffull', title: 'The Whole Trip', from: 0, to: 8, full: true,
        blurb: 'Fawley Refinery to Washwood Heath Yard in one run.' }
    ],
    scale: 0.1, minLeg: 1800, tod: [7, 13], weather: true, traffic: true, others: 'xc',
    train: { img: 'assets/loco.png', spr: 54, couple: 4, dial: 70, vmax: 60, aMax: 0.35, pm: 4.5, brake: [0, 0.2, 0.4, 0.6],
      empty: { aMax: 0.6, pm: 9, brake: [0, 0.28, 0.55, 0.8] },   // performance with the tankers empty (return direction)
      cars: [tank, tank, tank, tank, tank, tank, tank, tank, tank, tank, loco] }
  });

  // Mission descriptions for the return direction
  const BACK = {
    m1: 'Down from Reading over the Hampshire downs and through the New Forest to the sea at Bournemouth.',
    m2: "Out of New Street under the wires, past Oxford's spires and down the Thames Valley to Reading.",
    m3: 'South from York through steel city and past the Crooked Spire, then in through the New Street tunnels.',
    m4: 'Over the Tyne and Durham Viaduct, then 125 mph running down the East Coast Main Line to York.',
    m5: 'A dawn start from Edinburgh, over the Royal Border Bridge and down the Northumberland coast.',
    full: 'All 20 stations, Edinburgh Haymarket to Bournemouth, dawn to dusk.',
    v1: 'The long run up from Finsbury Park to Seven Sisters, then on to the end of the line at Walthamstow.',
    v2: "Quick hops from Oxford Circus to Euston and King's Cross, then under Islington to Finsbury Park.",
    v3: 'From Brixton beneath the river at Vauxhall, then Victoria and Green Park to Oxford Circus.',
    vfull: 'All 16 stations, Brixton to Walthamstow Central.',
    f1: 'Empty tankers back over the Hampshire downs to the refinery. Lighter and livelier than the loaded run.',
    f2: 'Empties out of the yard, along the single line from Coventry and down through Oxford to Reading.',
    ffull: 'Washwood Heath Yard to Fawley Refinery in one run, with the tankers empty.'
  };
  for (const r of RS.ROUTES) for (const m of r.missions) m.back = BACK[m.id];

  // Make a route current: the rest of the game reads STATIONS / LEGS / MISSIONS from here
  RS.useRoute = function (r) {
    RS.ROUTE = r; RS.STATIONS = r.stations; RS.LEGS = r.legs; RS.MISSIONS = r.missions; RS.UNLOCK = r.unlock;
    // Cumulative real miles to each station (used for time-of-day lighting)
    RS.CUM = [0];
    r.legs.forEach((l, i) => RS.CUM.push(RS.CUM[i] + l.miles));
    RS.TOTAL_MILES = RS.CUM[RS.CUM.length - 1];
  };
  RS.useRoute(RS.ROUTES[0]);

  // Career ranks, by share of the route's stars earned
  RS.RANKS = [[0, 'Trainee Driver'], [0.17, 'Qualified Driver'], [0.39, 'Senior Driver'], [0.6, 'Driver Instructor'], [0.83, 'Top Link Driver']];
})();
