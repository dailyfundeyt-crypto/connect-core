export interface BrainFmTrack {
  id: string;
  title: string;
  zone: "delta" | "theta" | "alpha" | "beta" | "gamma" | "bonus";
  zoneLabel: string;
  zoneHz: string;
  promptTitle: string;
  description: string;
  audioUrl: string;
  color: string;
}

export const BRAIN_FM_TRACKS: BrainFmTrack[] = [
  // DELTA (0.5 – 4 Hz) — Tiefschlaf & Regeneration
  {
    id: "submerged-horizons",
    title: "Submerged Horizons",
    zone: "delta",
    zoneLabel: "Delta (Tiefschlaf)",
    zoneHz: "2 Hz",
    promptTitle: "Prompt 1 — Deep Ocean Sleep",
    description: "Tiefer Sub-Bass-Drone mit schwebenden Pads und Unterwasser-Hall. 2 Hz Pulse zur tiefen zellulären Regeneration.",
    audioUrl: "/audio/brainfm/Submerged_Horizons.mp3",
    color: "from-blue-600/20 to-indigo-900/30",
  },
  {
    id: "rain-on-the-canopy",
    title: "Rain on the Canopy",
    zone: "delta",
    zoneLabel: "Delta (Schlaf)",
    zoneHz: "2 Hz",
    promptTitle: "Prompt 2 — Forest Night Rain",
    description: "Regen auf Blätterdach, sanfter ferner Donner und beruhigende Wald-Atmosphäre für tiefsten Schlaf.",
    audioUrl: "/audio/brainfm/Rain_on_the_Canopy.mp3",
    color: "from-sky-600/20 to-blue-950/30",
  },
  {
    id: "where-light-fails",
    title: "Where Light Fails",
    zone: "delta",
    zoneLabel: "Delta (Traum)",
    zoneHz: "1.5 Hz",
    promptTitle: "Prompt 3 — Cosmic Void",
    description: "Sci-Fi Dark Ambient Textur mit weiter Stereobreite. Pure Weite und Entspannung des Nervensystems.",
    audioUrl: "/audio/brainfm/Where_Light_Fails.mp3",
    color: "from-indigo-700/20 to-slate-950/30",
  },

  // THETA (4 – 8 Hz) — Tiefe Meditation & Kreativität
  {
    id: "starlight-over-the-peak",
    title: "Starlight Over the Peak",
    zone: "theta",
    zoneLabel: "Theta (Meditation)",
    zoneHz: "6 Hz",
    promptTitle: "Prompt 4 — Tibetan Dream State",
    description: "Tibetische Klangschalen, weicher Hall und warmer Sub-Bass für tiefe meditative Versenkung.",
    audioUrl: "/audio/brainfm/Starlight_Over_the_Peak.mp3",
    color: "from-purple-600/20 to-violet-950/30",
  },
  {
    id: "beneath-a-golden-canopy",
    title: "Beneath a Golden Canopy",
    zone: "theta",
    zoneLabel: "Theta (Kreativität)",
    zoneHz: "5.5 Hz",
    promptTitle: "Prompt 5 — REM Float Tank",
    description: "Schwebende warme Flächen und gefühlvolle Pianotupfer für kreative Tagträume und Introspektion.",
    audioUrl: "/audio/brainfm/Beneath_a_Golden_Canopy.mp3",
    color: "from-fuchsia-600/20 to-purple-950/30",
  },
  {
    id: "the-weight-of-the-deep",
    title: "The Weight of the Deep",
    zone: "theta",
    zoneLabel: "Theta (Cinematic)",
    zoneHz: "6 Hz",
    promptTitle: "Prompt 6 — NF-Style Cinematic Instrumental",
    description: "Dunkle Streicher-Staccatos, melancholisches Piano und tiefer 808-Sub für maximale emotionale Tiefe.",
    audioUrl: "/audio/brainfm/The_Weight_of_the_Deep.mp3",
    color: "from-violet-700/20 to-slate-900/40",
  },

  // ALPHA (8 – 13 Hz) — Entspannung & Leichter Fokus
  {
    id: "afternoon-window-seat",
    title: "Afternoon Window Seat",
    zone: "alpha",
    zoneLabel: "Alpha (Flow)",
    zoneHz: "10 Hz",
    promptTitle: "Prompt 7 — Cafe Flow State",
    description: "Gemütlicher Lo-Fi Beat mit Rhodes-Piano und warmem Vinyl-Knister. Ideal für leichtes Arbeiten und Lesen.",
    audioUrl: "/audio/brainfm/Afternoon_Window_Seat.mp3",
    color: "from-emerald-600/20 to-teal-950/30",
  },
  {
    id: "morning-beneath-the-pines",
    title: "Morning Beneath the Pines",
    zone: "alpha",
    zoneLabel: "Alpha (Fokus)",
    zoneHz: "10 Hz",
    promptTitle: "Prompt 8 — Ambient Japanese Garden",
    description: "Koto-Harp Arpeggios, warmer Bass und ruhige Wald-Ambience für konzentriertes, stressfreies Schaffen.",
    audioUrl: "/audio/brainfm/Morning_Beneath_the_Pines.mp3",
    color: "from-green-600/20 to-emerald-950/30",
  },
  {
    id: "a-window-into-stillness",
    title: "A Window Into Stillness",
    zone: "alpha",
    zoneLabel: "Alpha (Ruhe)",
    zoneHz: "8.5 Hz",
    promptTitle: "Prompt 9 — Neoclassical Study Room",
    description: "Solo-Piano mit weichem Filz-Klang, Streicher-Pads und leiser Raumakustik.",
    audioUrl: "/audio/brainfm/A_Window_Into_Stillness.mp3",
    color: "from-teal-600/20 to-cyan-950/30",
  },

  // BETA (13 – 30 Hz) — Aktiver Arbeitsfokus & Problemlösung
  {
    id: "calculating-the-horizon",
    title: "Calculating the Horizon",
    zone: "beta",
    zoneLabel: "Beta (Arbeit)",
    zoneHz: "18 Hz",
    promptTitle: "Prompt 10 — Modular Synthesizer Matrix",
    description: "Pulsierende Sequenzer-Muster, analoge Synths und treibender 18 Hz Puls für Coding und Recherche.",
    audioUrl: "/audio/brainfm/Calculating_the_Horizon.mp3",
    color: "from-amber-600/20 to-orange-950/30",
  },
  {
    id: "slow-clockwork",
    title: "Slow Clockwork",
    zone: "beta",
    zoneLabel: "Beta (Takt)",
    zoneHz: "16 Hz",
    promptTitle: "Prompt 11 — Lo-Fi Clockwork Study",
    description: "Rhythmische Uhren-Ticks, sanfte Drums und warme Rhodes-Akkorde für kontinuierlichen Fortschritt.",
    audioUrl: "/audio/brainfm/Slow_Clockwork.mp3",
    color: "from-yellow-600/20 to-amber-950/30",
  },
  {
    id: "beneath-the-surface",
    title: "Beneath the Surface",
    zone: "beta",
    zoneLabel: "Beta (Konzentration)",
    zoneHz: "20 Hz",
    promptTitle: "Prompt 12 — Cinematic Focus Pulse",
    description: "Minimalistischer Percussion-Loop mit warmen Pads für intensive Arbeitsphasen ohne Ablenkung.",
    audioUrl: "/audio/brainfm/Beneath_the_Surface.mp3",
    color: "from-orange-600/20 to-red-950/30",
  },

  // GAMMA (30 – 100 Hz) — Spitzen-Performance & Hyper-Fokus
  {
    id: "steel-toe-piston",
    title: "Steel Toe Piston",
    zone: "gamma",
    zoneLabel: "Gamma (High-Drive)",
    zoneHz: "40 Hz",
    promptTitle: "Prompt 13 — Industrial Cyberpunk Sprint",
    description: "Dunkler Synthwave-Bass, treibende Rhythmen und 40 Hz Gamma-Pulse für High-Speed Sprints.",
    audioUrl: "/audio/brainfm/Steel_Toe_Piston.mp3",
    color: "from-rose-600/20 to-red-950/30",
  },
  {
    id: "thunder-at-the-gates",
    title: "Thunder at the Gates",
    zone: "gamma",
    zoneLabel: "Gamma (Energie)",
    zoneHz: "40 Hz",
    promptTitle: "Prompt 14 — Orchestral Battle Focus",
    description: "Epische Trommeln, Blechbläser-Drones und maximale Dichte für anspruchsvolle Herausforderungen.",
    audioUrl: "/audio/brainfm/Thunder_at_the_Gates.mp3",
    color: "from-red-600/20 to-rose-950/30",
  },
  {
    id: "the-view-from-am",
    title: "The View From AM",
    zone: "gamma",
    zoneLabel: "Gamma (Klarheit)",
    zoneHz: "40 Hz",
    promptTitle: "Prompt 15 — Fast Arpeggiator Sunrise",
    description: "Schnell perlende Synthesizer-Arpeggios und kristallklare Höhen für messerscharfen Verstand.",
    audioUrl: "/audio/brainfm/The_View_From_AM.mp3",
    color: "from-pink-600/20 to-rose-950/30",
  },

  // BONUS — Nature + Binaural
  {
    id: "stillness-at-the-summit",
    title: "Stillness at the Summit",
    zone: "bonus",
    zoneLabel: "Bonus (Wind & Peak)",
    zoneHz: "Alpha/Theta",
    promptTitle: "Prompt 16 — Mountain Summit Wind & Bells",
    description: "Wind über Berggipfeln, ferne tibetische Glocken und harmonischer Sub-Bass für absolute Erdung.",
    audioUrl: "/audio/brainfm/Stillness_at_the_Summit.mp3",
    color: "from-cyan-600/20 to-blue-950/30",
  },
  {
    id: "rain-on-the-glass-tower",
    title: "Rain on the Glass Tower",
    zone: "bonus",
    zoneLabel: "Bonus (Urban Rain)",
    zoneHz: "10 Hz Alpha",
    promptTitle: "Prompt 17 — Penthouse Rain Storm",
    description: "Stetiger Regen gegen Hochhaus-Panoramafenster mit tiefem 10 Hz Alpha-Drone im Hintergrund.",
    audioUrl: "/audio/brainfm/Rain_On_The_Glass_Tower.mp3",
    color: "from-blue-700/20 to-slate-900/40",
  },
];
