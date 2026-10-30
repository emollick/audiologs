// Touch controls: left thumb moves, right thumb looks, buttons for use / flashlight / logs.
export function setupTouch(player, { onUse, onLight, onLogs }) {
  const root = document.getElementById("touch");
  root.classList.add("on");
  const stick = root.querySelector(".stick");
  const knob = root.querySelector(".knob");
  let moveId = null;
  let lookId = null;
  let origin = null;
  let last = null;

  const onStart = (e) => {
    for (const t of e.changedTouches) {
      if (t.target.closest("button")) continue;
      if (t.clientX < innerWidth * 0.45 && moveId === null) {
        moveId = t.identifier;
        origin = { x: t.clientX, y: t.clientY };
        stick.style.left = `${origin.x}px`;
        stick.style.top = `${origin.y}px`;
        stick.classList.add("show");
      } else if (lookId === null) {
        lookId = t.identifier;
        last = { x: t.clientX, y: t.clientY };
      }
    }
    e.preventDefault();
  };
  const onMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        let dx = t.clientX - origin.x;
        let dy = t.clientY - origin.y;
        const len = Math.hypot(dx, dy);
        const max = 55;
        if (len > max) {
          dx *= max / len;
          dy *= max / len;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        player.touchMove.x = dx / max;
        player.touchMove.y = dy / max;
      } else if (t.identifier === lookId) {
        player.look((t.clientX - last.x) * 2.4, (t.clientY - last.y) * 2.4);
        last = { x: t.clientX, y: t.clientY };
      }
    }
    e.preventDefault();
  };
  const onEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null;
        player.touchMove.x = player.touchMove.y = 0;
        knob.style.transform = "";
        stick.classList.remove("show");
      } else if (t.identifier === lookId) lookId = null;
    }
  };
  const surface = document.getElementById("view");
  surface.addEventListener("touchstart", onStart, { passive: false });
  surface.addEventListener("touchmove", onMove, { passive: false });
  surface.addEventListener("touchend", onEnd);
  surface.addEventListener("touchcancel", onEnd);
  root.querySelector(".use").addEventListener("click", onUse);
  root.querySelector(".light").addEventListener("click", onLight);
  root.querySelector(".logs").addEventListener("click", onLogs);
}
