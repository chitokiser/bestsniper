/**
 * SNIPER WEB — the reticle never sits perfectly still.
 *
 * Shouldered and looking through the scope, the view drifts in a slow,
 * slightly irregular figure of eight (a heartbeat and a breathing cycle, not
 * a sine wave). The drift is bigger standing than crouched, much bigger on
 * the move, and grows with magnification only in the sense that the same
 * angle covers more of the picture.
 *
 * Holding the sprint key while scoped holds the breath: the drift dies away
 * within half a second and stays almost gone for `HOLD_MAX` seconds. Hold it
 * longer, or let go and take it again too soon, and the shooter runs short:
 * the drift comes back larger until the breath recovers.
 *
 * The offsets are added to the player's view angles each rendered frame, and
 * rifle rounds leave along the view (Weapon.fire), so what the reticle shows
 * at the moment of the shot is where the round goes.
 */
const AMP = 0.0016;          // radians, standing still, rested breathing
const HOLD_MAX = 4.0;        // seconds of steady hold
const RECOVER = 0.45;        // breath regained per second (0..1)

export class ScopeSway {
  constructor() {
    this.time = 0;
    this.breath = 1;          // 1 = full lungs to spend, 0 = out of breath
    this.holding = false;
    this.calm = 0;            // 0..1, how far the hold has settled the drift
    this.winded = 0;          // extra drift after running out
    this.offsetPitch = 0;
    this.offsetYaw = 0;
  }

  reset() {
    this.breath = 1; this.holding = false; this.calm = 0; this.winded = 0;
    this.offsetPitch = 0; this.offsetYaw = 0;
  }

  /**
   * @param dt        render frame time
   * @param scoped    0..1 how far into the scope the view is
   * @param wantHold  sprint key held
   * @param player    for stance and movement
   */
  update(dt, scoped, wantHold, player) {
    this.time += dt;
    const canHold = scoped > 0.9 && this.breath > 0.05;
    this.holding = wantHold && canHold;
    if (this.holding) {
      this.breath = Math.max(0, this.breath - dt / HOLD_MAX);
      if (this.breath <= 0.05) this.winded = 1;
    } else {
      this.breath = Math.min(1, this.breath + dt * RECOVER * (wantHold ? 0 : 1));
    }
    this.calm += ((this.holding ? 1 : 0) - this.calm) * Math.min(1, dt * (this.holding ? 6 : 3));
    this.winded = Math.max(0, this.winded - dt * 0.35);

    const stance = player.crouched ? 0.55 : 1;
    const moving = 1 + Math.min(1, player.speedNorm ?? 0) * 3;
    const amp = AMP * stance * moving * (1 + this.winded * 1.6) * (1 - this.calm * 0.9) * scoped;

    // Two incommensurate cycles: breathing (~0.23 Hz) and a faster tremor.
    const t = this.time;
    const pitch = Math.sin(t * 1.45) * 0.8 + Math.sin(t * 3.7 + 1.3) * 0.2 + Math.sin(t * 7.9) * 0.05;
    const yaw = Math.sin(t * 0.72 + 0.4) * 0.9 + Math.sin(t * 2.9) * 0.15;
    this.offsetPitch = pitch * amp;
    this.offsetYaw = yaw * amp * 1.2;
  }

  /** Add this frame's drift to the player's view. */
  apply(player) {
    player.viewPitch += this.offsetPitch;
    player.viewYaw += this.offsetYaw;
  }
}
