// Static configuration: trades, badges, fonts and output sizes.

export const TRADES = [
  { id: 'electrical', label: 'Electrical', icon: 'zap',
    categories: ['Panel Upgrade', 'EV Charger', 'Lighting', 'Rewiring', 'Generator', 'Service Call'],
    hashtags: '#electrician #electrical #electricalcontractor #panelupgrade',
    badges: ['Licensed & Insured', 'Free Estimates', '24/7 Emergency'] },
  { id: 'plumbing', label: 'Plumbing', icon: 'droplet',
    categories: ['Bathroom', 'Water Heater', 'Repiping', 'Drain & Sewer', 'Fixtures', 'Leak Repair'],
    hashtags: '#plumber #plumbing #plumbingservices #waterheater',
    badges: ['Licensed & Insured', '24/7 Emergency', 'Upfront Pricing'] },
  { id: 'hvac', label: 'HVAC', icon: 'snowflake',
    categories: ['AC Install', 'Furnace', 'Heat Pump', 'Ductwork', 'Maintenance', 'Mini-Split'],
    hashtags: '#hvac #heating #airconditioning #heatpump',
    badges: ['Licensed & Insured', 'Financing Available', 'Same-Day Service'] },
  { id: 'roofing', label: 'Roofing', icon: 'house',
    categories: ['Roof Replacement', 'Roof Repair', 'Gutters', 'Siding', 'Storm Damage'],
    hashtags: '#roofing #roofer #newroof #roofreplacement',
    badges: ['Licensed & Insured', 'Free Inspections', 'Warranty Included'] },
  { id: 'remodeling', label: 'Remodeling', icon: 'hammer',
    categories: ['Kitchen', 'Bathroom', 'Basement', 'Addition', 'Whole Home'],
    hashtags: '#remodel #renovation #homeimprovement #beforeandafter',
    badges: ['Licensed & Insured', 'Free Estimates', 'Family Owned'] },
  { id: 'general', label: 'General Contractor', icon: 'hard-hat',
    categories: ['New Construction', 'Renovation', 'Commercial', 'Deck', 'Framing'],
    hashtags: '#generalcontractor #construction #builder #homeimprovement',
    badges: ['Licensed & Insured', 'Free Estimates', 'Satisfaction Guaranteed'] },
  { id: 'painting', label: 'Painting', icon: 'paint-roller',
    categories: ['Interior', 'Exterior', 'Cabinets', 'Deck Staining', 'Drywall'],
    hashtags: '#painting #painter #housepainting #interiorpainting',
    badges: ['Licensed & Insured', 'Free Estimates', 'Clean Job Sites'] },
  { id: 'landscaping', label: 'Landscaping', icon: 'leaf',
    categories: ['Hardscape', 'Patio', 'Lawn Care', 'Planting', 'Retaining Wall', 'Cleanup'],
    hashtags: '#landscaping #hardscape #lawncare #curbappeal',
    badges: ['Licensed & Insured', 'Free Estimates', 'Family Owned'] },
  { id: 'flooring', label: 'Flooring', icon: 'grid-2x2',
    categories: ['Hardwood', 'Tile', 'LVP', 'Carpet', 'Refinishing'],
    hashtags: '#flooring #hardwoodfloors #tile #flooringinstallation',
    badges: ['Licensed & Insured', 'Free Estimates', 'Financing Available'] },
  { id: 'handyman', label: 'Handyman', icon: 'wrench',
    categories: ['Repairs', 'Installations', 'Carpentry', 'Drywall', 'Odd Jobs'],
    hashtags: '#handyman #homerepair #handymanservices #fixit',
    badges: ['Insured', 'Upfront Pricing', 'Same-Day Service'] },
  { id: 'concrete', label: 'Concrete & Masonry', icon: 'brick-wall',
    categories: ['Driveway', 'Patio', 'Stonework', 'Foundation', 'Steps'],
    hashtags: '#concrete #masonry #hardscape #stonework',
    badges: ['Licensed & Insured', 'Free Estimates', 'Warranty Included'] },
  { id: 'solar', label: 'Solar', icon: 'sun',
    categories: ['Solar Install', 'Battery Storage', 'Panel Cleaning', 'Inspection'],
    hashtags: '#solar #solarenergy #solarpanels #cleanenergy',
    badges: ['Licensed & Insured', 'Financing Available', 'Warranty Included'] },
  { id: 'cleaning', label: 'Cleaning', icon: 'sparkles',
    categories: ['Deep Clean', 'Move-Out', 'Pressure Washing', 'Windows', 'Post-Construction'],
    hashtags: '#cleaning #pressurewashing #cleaningservice #satisfying',
    badges: ['Insured', 'Satisfaction Guaranteed', 'Eco-Friendly'] },
];

export const tradeById = (id) => TRADES.find((t) => t.id === id) || TRADES.find((t) => t.id === 'general');

export const BADGES = [
  'Licensed & Insured', 'Free Estimates', '24/7 Emergency', 'Family Owned', 'Satisfaction Guaranteed',
  'Financing Available', 'Same-Day Service', 'Upfront Pricing', 'Warranty Included', 'Veteran Owned',
  'Locally Owned', 'Free Inspections', 'Clean Job Sites', 'Eco-Friendly', 'Insured',
];

// Headline font styles used on the graphics. `upper` forces uppercase headlines.
export const FONT_STYLES = {
  anton:   { label: 'Impact',    family: 'Anton',         weight: '400', upper: true,  line: 1.02, track: 0.5 },
  archivo: { label: 'Heavy',     family: 'Archivo Black', weight: '400', upper: true,  line: 1.02, track: 0 },
  oswald:  { label: 'Condensed', family: 'Oswald',        weight: '700', upper: true,  line: 1.05, track: 0.5 },
  bebas:   { label: 'Clean',     family: 'Bebas Neue',    weight: '400', upper: true,  line: 0.98, track: 1 },
  inter:   { label: 'Modern',    family: 'Inter',         weight: '800', upper: false, line: 1.08, track: -1 },
};

export const SIZES = {
  square:    { label: 'Square',    hint: '1:1 · Feed',      w: 1080, h: 1080 },
  portrait:  { label: 'Portrait',  hint: '4:5 · Instagram', w: 1080, h: 1350 },
  story:     { label: 'Story',     hint: '9:16 · Reels',    w: 1080, h: 1920 },
  landscape: { label: 'Landscape', hint: '1.91:1 · FB/Google', w: 1200, h: 628 },
};

export const HEADLINE_TAGS = ['Project Spotlight', 'Just Completed', 'Before & After', 'Transformation', 'Recent Work', 'Job Done Right'];

// Size choices for the logo and QR code on the graphics.
export const ELEMENT_SIZES = {
  s: { label: 'S', name: 'Small', scale: 0.75 },
  m: { label: 'M', name: 'Medium', scale: 1 },
  l: { label: 'L', name: 'Large', scale: 1.35 },
  xl: { label: 'XL', name: 'Extra large', scale: 1.7 },
};

// Color themes — independent of trade. `primary` is the background, `accent` the highlight.
export const THEMES = [
  { id: 'navy-gold', name: 'Navy & Gold', primary: '#102a43', accent: '#f4c430' },
  { id: 'charcoal-yellow', name: 'Charcoal & Yellow', primary: '#111827', accent: '#facc15' },
  { id: 'ocean', name: 'Ocean Blue', primary: '#0b3a67', accent: '#38bdf8' },
  { id: 'royal-sky', name: 'Royal & Sky', primary: '#1e3a8a', accent: '#93c5fd' },
  { id: 'steel-orange', name: 'Steel & Orange', primary: '#1f2937', accent: '#f97316' },
  { id: 'black-red', name: 'Black & Red', primary: '#0a0a0a', accent: '#ef4444' },
  { id: 'brick-amber', name: 'Brick & Amber', primary: '#7f1d1d', accent: '#fbbf24' },
  { id: 'forest-lime', name: 'Forest & Lime', primary: '#14532d', accent: '#a3e635' },
  { id: 'slate-mint', name: 'Slate & Mint', primary: '#334155', accent: '#6ee7b7' },
  { id: 'teal-sun', name: 'Teal & Sun', primary: '#0e7490', accent: '#fde047' },
  { id: 'espresso-tan', name: 'Espresso & Tan', primary: '#3b2f2f', accent: '#d6a55a' },
  { id: 'plum-pink', name: 'Plum & Pink', primary: '#312e81', accent: '#f472b6' },
  { id: 'graphite-cyan', name: 'Graphite & Cyan', primary: '#18181b', accent: '#22d3ee' },
  { id: 'white-red', name: 'Clean White & Red', primary: '#ffffff', accent: '#dc2626' },
  { id: 'white-blue', name: 'Clean White & Blue', primary: '#ffffff', accent: '#1d4ed8' },
];
export const themeFor = (c) => THEMES.find((t) => t.primary.toLowerCase() === String(c.primary).toLowerCase() && t.accent.toLowerCase() === String(c.accent).toLowerCase()) || null;


export function newClient(overrides = {}) {
  const trade = tradeById(overrides.trade || 'general');
  return {
    id: crypto.randomUUID(),
    name: '',
    tagline: '',
    trade: trade.id,
    phone: '',
    website: '',
    bookingUrl: '',
    license: '',
    years: '',
    rating: '',
    serviceArea: '',
    primary: THEMES[0].primary,
    accent: THEMES[0].accent,
    logoSize: 'm',
    qrSize: 'm',
    font: 'anton',
    logo: null,
    logoChip: true,
    badges: trade.badges.slice(0, 2),
    hashtags: trade.hashtags,
    updated: Date.now(),
    ...overrides,
  };
}

export function newProject(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    clientId: null,
    title: '',
    description: '',
    category: '',
    location: '',
    headline: 'Project Spotlight',
    template: 'split',
    size: 'square',
    font: '',            // '' = use the client's font
    photos: { before: null, after: null },
    adjust: {},          // slot -> { fx, fy, zoom }
    show: { logo: true, badges: true, contact: true, qr: false },
    review: { text: '', name: '' },
    offer: { headline: '', details: '', cta: 'Call today' },
    logoSize: '',        // '' = use the brand's default size
    qrSize: '',
    notes: '',           // a few words for the AI writer
    tone: 'professional',
    photoMeta: {},       // slot -> { lat, lon, taken } read from the original photo's EXIF
    created: Date.now(),
    updated: Date.now(),
    ...overrides,
  };
}
