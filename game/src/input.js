// input.js — keyboard and mouse state, polled by the game loop. Also keeps a
// set of keys pressed this frame so menus and interactions can edge-trigger.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(),
    mouse: { x: 0, y: 0, down: false, clicked: false },
    attach,
  };
  let attached = false;

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
  }
  function onKeyUp(e) {
    input.keys.delete(e.code);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = e.clientX - rect.left;
    input.mouse.y = e.clientY - rect.top;
  }
  function onMouseDown(e) {
    input.mouse.down = true;
    input.mouse.clicked = true;
    onMouseMove(e);
  }
  function onMouseUp() {
    input.mouse.down = false;
  }
  function attach() {
    if (attached) return;
    attached = true;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
  }
  return input;
}

// Call at the end of each frame: clears the edge-triggered sets.
export function endFrame(input) {
  input.pressed.clear();
  input.mouse.clicked = false;
}

export function keyDown(input, ...codes) {
  return codes.some((c) => input.keys.has(c));
}

export function keyPressed(input, ...codes) {
  return codes.some((c) => input.pressed.has(c));
}
