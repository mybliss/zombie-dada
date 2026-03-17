import { RECOVERY } from "./lib/config.mjs";
import { ensureRecoveryState } from "./lib/recovery.mjs";

try {
  console.log(JSON.stringify(ensureRecoveryState(RECOVERY.edgeStartHall), null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
