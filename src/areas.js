// Hyderabad localities with approximate centroid coordinates (WGS84).
// Centroids are approximations for matching only; verify/adjust with your ops team before launch.
export const AREAS = {
  'gachibowli': { lat: 17.4401, lng: 78.3489, names: ['gachibowli', 'gachibouli', 'గచ్చిబౌలి', 'गाचीबोवली', 'गचीबोवली'] },
  'kondapur': { lat: 17.4616, lng: 78.3630, names: ['kondapur', 'kondapuram', 'కొండాపూర్', 'कोंडापुर'] },
  'madhapur': { lat: 17.4483, lng: 78.3915, names: ['madhapur', 'madapur', 'మాదాపూర్', 'माधापुर'] },
  'hitech city': { lat: 17.4435, lng: 78.3772, names: ['hitech city', 'hitec city', 'hi-tech city', 'hitechcity', 'cyberabad', 'హైటెక్ సిటీ', 'हाईटेक सिटी'] },
  'kothaguda': { lat: 17.4630, lng: 78.3720, names: ['kothaguda', 'కొత్తగూడ', 'कोठागुडा'] },
  'nanakramguda': { lat: 17.4150, lng: 78.3430, names: ['nanakramguda', 'financial district', 'fin district', 'నానక్‌రామ్‌గూడ', 'నానక్రామ్గూడ', 'नानकरामगुडा'] },
  'manikonda': { lat: 17.4045, lng: 78.3866, names: ['manikonda', 'మణికొండ', 'मणिकोंडा'] },
  'miyapur': { lat: 17.4968, lng: 78.3614, names: ['miyapur', 'మియాపూర్', 'मियापुर'] },
  'kukatpally': { lat: 17.4948, lng: 78.3996, names: ['kukatpally', 'kphb', 'కూకట్‌పల్లి', 'కూకట్పల్లి', 'कुकटपल्ली'] },
  'jubilee hills': { lat: 17.4326, lng: 78.4071, names: ['jubilee hills', 'జూబ్లీ హిల్స్', 'जुबली हिल्स'] },
  'banjara hills': { lat: 17.4156, lng: 78.4347, names: ['banjara hills', 'బంజారా హిల్స్', 'बंजारा हिल्स'] },
  'ameerpet': { lat: 17.4375, lng: 78.4482, names: ['ameerpet', 'అమీర్‌పేట్', 'అమీర్పేట్', 'अमीरपेट'] },
  'begumpet': { lat: 17.4447, lng: 78.4664, names: ['begumpet', 'బేగంపేట్', 'बेगमपेट'] },
  'secunderabad': { lat: 17.4399, lng: 78.4983, names: ['secunderabad', 'సికింద్రాబాద్', 'सिकंदराबाद'] },
  'tolichowki': { lat: 17.4010, lng: 78.4130, names: ['tolichowki', 'toli chowki', 'టోలిచౌకి', 'टोलीचौकी'] },
  'mehdipatnam': { lat: 17.3959, lng: 78.4391, names: ['mehdipatnam', 'మెహదీపట్నం', 'मेहदीपट्नम'] },
  'narsingi': { lat: 17.3880, lng: 78.3550, names: ['narsingi', 'నార్సింగి', 'नरसिंगी'] },
  'dilsukhnagar': { lat: 17.3687, lng: 78.5247, names: ['dilsukhnagar', 'దిల్‌సుఖ్‌నగర్', 'దిల్సుఖ్నగర్', 'दिलसुखनगर'] },
  'lb nagar': { lat: 17.3457, lng: 78.5522, names: ['lb nagar', 'l.b. nagar', 'ఎల్బీ నగర్', 'एलबी नगर'] },
  'uppal': { lat: 17.4058, lng: 78.5591, names: ['uppal', 'ఉప్పల్', 'उप्पल'] },
};

const toRad = d => (d * Math.PI) / 180;
export function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Longest alias first, so "hitech city" wins over substrings.
const ALIASES = Object.entries(AREAS)
  .flatMap(([key, a]) => a.names.map(n => [n.toLowerCase(), key]))
  .sort((x, y) => y[0].length - x[0].length);

export function findArea(text) {
  const s = String(text || '').toLowerCase().normalize('NFC');
  for (const [alias, key] of ALIASES) if (s.includes(alias)) return key;
  return null;
}

// Map a WhatsApp location pin to the nearest known locality within maxKm.
export function nearestArea(lat, lng, maxKm = 3.5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = null;
  for (const [key, a] of Object.entries(AREAS)) {
    const d = distanceKm({ lat, lng }, a);
    if (d <= maxKm && (!best || d < best.distanceKm)) best = { key, distanceKm: d };
  }
  return best;
}

export function areaLabel(key) {
  return String(key || '').split(' ').map(w => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

export function isPilotArea(key, config) {
  return Boolean(key && config.pilotAreas.includes(key));
}
