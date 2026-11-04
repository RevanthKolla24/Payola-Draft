export const SERVICES = { unknown: 'Multiple services / Not sure', spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube Music', other: 'Another service' };
export function attribution(service = 'unknown', confirmed = false, scenario = false) {
  if (!Object.hasOwn(SERVICES, service)) throw new Error('Choose a supported service option.');
  if (service !== 'unknown' && !confirmed) throw new Error('Confirm that all scrobbles in the requested period came from this service, or choose Multiple services / Not sure.');
  return { service, label: SERVICES[service], confirmed: service !== 'unknown' && confirmed, scenario: service === 'spotify' && confirmed && scenario };
}
export function attributionText(value) {
  if (!value || value.service === 'unknown') return 'Mixed / unknown services · unpriced';
  const period = value.from && value.to ? ` for ${value.from} – ${value.to} UTC` : '';
  return `${value.label} · service self-reported${period}${value.scenario ? ' · hypothetical benchmark scenario' : ' · unpriced'}`;
}