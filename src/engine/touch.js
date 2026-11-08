// Virtual joystick + buttons (pointer events). STUB: registers nothing yet; exports the merge() input.js calls.
// Activated only on touch devices or ?touch=1 (core.flags.touch). A later change fills init()/merge() in.
export const state = { active: false, ix: 0, iy: 0, look: 0, jump: false, jumpHeld: false, pound: false };
export function init(/* { root, onPause } */) { state.active = false; }
export function setVisible(/* v */) {}
/** merge(input): adds the touch axes/buttons into the keyboard/gamepad input object and returns it. */
export function merge(input) {
  if (!state.active) return input;
  input.ix += state.ix; input.iy += state.iy; input.look += state.look;
  if (state.jump) { input.jump = true; state.jump = false; }
  if (state.pound) { input.pound = true; state.pound = false; }
  input.jumpHeld = input.jumpHeld || state.jumpHeld;
  return input;
}
export const touch = { state, init, setVisible, merge };
export default touch;
