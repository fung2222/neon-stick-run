// CYBER ARCADE hub contract — game-specific readHub (trial caps) + kit returnToHub.
// Launch URL: ?hub=1&tier=free|silver|gold&ads=0|1[&trial=1&trialLeft=N][&ret=<hub URL>]
import { TRIAL } from './config.js';
import { readHub as kitReadHub, returnToHub as kitReturnToHub, shouldShowArcadeMenu } from '../vendor/cyber-kit/platform/hub.js';

export { shouldShowArcadeMenu };

export function readHub(search = location.search) {
  const base = kitReadHub(search);
  return { ...base, caps: base.trial ? { ...TRIAL } : null };
}

/** Trial unlock: openStore true (default). Home arcade menu: pass { openStore: false }. */
export function returnToHub(hub, opts = {}) {
  const openStore = opts.openStore !== undefined ? opts.openStore : true;
  return kitReturnToHub({ gameId: 'neon-stick-run', openStore }, opts.search || location.search);
}
