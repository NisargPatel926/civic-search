export const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

export const ABBR_BY_NAME = Object.fromEntries(
  Object.entries(STATES).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

/** Best-effort state detection for addresses the geocoder could not match. */
export function guessState(address = '') {
  const text = String(address);
  const abbrMatch = text.match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/);
  if (abbrMatch && STATES[abbrMatch[1]]) return abbrMatch[1];
  const lower = text.toLowerCase();
  for (const [name, abbr] of Object.entries(ABBR_BY_NAME)) {
    if (lower.includes(name)) return abbr;
  }
  return null;
}
