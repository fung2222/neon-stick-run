// CYBER ARCADE hub contract (cyber-arcade docs/MONETIZATION.md §8).
//   Launch URL from the hub:  ?hub=1&tier=free|silver|gold&ads=0|1[&trial=1&trialLeft=N]
//   Fallback cache:           localStorage 'cyber.entitlement' = { v:1, tier, products, … }
// These values only gate ads and trial caps. They are user-editable on the web, so never protect anything valuable with them.
import { TRIAL } from './config.js';

const TIERS = ['free', 'silver', 'gold'];
function readEnt() { try { const e = JSON.parse(localStorage.getItem('cyber.entitlement') || 'null'); return e && TIERS.includes(e.tier) ? e : null; } catch { return null; } }

export function readHub(search = location.search) {
  const p = new URLSearchParams(search);
  const fromHub = p.get('hub') === '1';
  const ent = readEnt();
  const tier = TIERS.includes(p.get('tier')) ? p.get('tier') : (ent ? ent.tier : null);
  // ads: explicit param wins; else derive from the tier (Free = interstitials at natural breaks); standalone web = allowed (web build shows none anyway)
  const ads = p.has('ads') ? p.get('ads') === '1' : (tier ? tier === 'free' : true);
  // trial caps apply only when the hub explicitly launches a trial run
  const trial = p.get('trial') === '1';
  const trialLeft = p.has('trialLeft') ? Math.max(0, parseInt(p.get('trialLeft'), 10) || 0) : null;
  return { fromHub, tier, ads, trial, trialLeft, caps: trial ? { ...TRIAL } : null, entitlement: ent };
}

/** Back to the hub that launched us (trial unlock button). Uses a same-origin ?ret= URL if given, else history (hub=1), else the public arcade root. */
export function returnToHub(hub, search = location.search) {
  // leave a note so the hub opens its unlock sheet for this game when we land back on it (cyber-arcade js/hub.js RETURN_KEY)
  try { localStorage.setItem('cyber.arcade.openStore', JSON.stringify({ game: 'neon-stick-run', t: Date.now() })); } catch { /* storage blocked */ }
  const ret = new URLSearchParams(search).get('ret');
  if (ret) { try { const u = new URL(ret, location.href); if (u.origin === location.origin) { location.href = u.href; return 'ret'; } } catch { /* bad url */ } }
  // the hub page sends no referrer (meta referrer=no-referrer), so only refuse to go back when a referrer proves we came from elsewhere
  const foreign = document.referrer && (() => { try { return new URL(document.referrer).origin !== location.origin; } catch { return true; } })();
  if (hub.fromHub && history.length > 1 && !foreign) { history.back(); return 'back'; }
  location.href = new URL('../cyber-arcade/', location.href).href; return 'root';
}
