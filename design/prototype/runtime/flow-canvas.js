/* global window */

(function attachFlowCanvas(globalScope) {
  function mount(options) {
    const canvas = options.canvas;
    const world = options.world;
    const zoomLabel = canvas.querySelector('[data-zoom-label]');
    const worldSize = options.worldSize;
    const view = { x: 0, y: 0, scale: 1 };
    const minScale = options.minScale ?? 0.28;
    const maxScale = options.maxScale ?? 1.35;
    const fitMaxScale = options.fitMaxScale ?? 0.72;
    const focusScale = options.focusScale ?? 0.82;
    const margin = options.margin ?? 56;
    let dragStart = null;

    world.style.width = `${worldSize.width}px`;
    world.style.height = `${worldSize.height}px`;

    function render() {
      world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      zoomLabel.value = `${Math.round(view.scale * 100)}%`;
      canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;
      const gridSize = 24 * view.scale;
      canvas.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    }

    function fit() {
      view.scale = Math.min(
        (canvas.clientWidth - margin * 2) / worldSize.width,
        (canvas.clientHeight - margin * 2) / worldSize.height,
        fitMaxScale,
      );
      view.x = (canvas.clientWidth - worldSize.width * view.scale) / 2;
      view.y = (canvas.clientHeight - worldSize.height * view.scale) / 2;
      render();
    }

    function focus(screenName) {
      const screen = world.querySelector(`[data-flow-screen="${screenName}"]`);
      if (!screen) return;
      view.scale = focusScale;
      view.x = canvas.clientWidth / 2 - (screen.offsetLeft + screen.offsetWidth / 2) * view.scale;
      view.y = canvas.clientHeight / 2 - (screen.offsetTop + screen.offsetHeight / 2) * view.scale;
      canvas.classList.add('is-centering');
      render();
      window.setTimeout(() => canvas.classList.remove('is-centering'), 420);
    }

    function zoomAt(clientX, clientY, factor) {
      const bounds = canvas.getBoundingClientRect();
      const pointerX = clientX - bounds.left;
      const pointerY = clientY - bounds.top;
      const worldX = (pointerX - view.x) / view.scale;
      const worldY = (pointerY - view.y) / view.scale;
      const nextScale = Math.min(maxScale, Math.max(minScale, view.scale * factor));
      view.x = pointerX - worldX * nextScale;
      view.y = pointerY - worldY * nextScale;
      view.scale = nextScale;
      render();
    }

    function zoomFromCenter(factor) {
      const bounds = canvas.getBoundingClientRect();
      zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, factor);
    }

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.001));
      },
      { passive: false },
    );

    canvas.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button, a')) return;
      dragStart = { pointerX: event.clientX, pointerY: event.clientY, x: view.x, y: view.y };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!dragStart) return;
      view.x = dragStart.x + event.clientX - dragStart.pointerX;
      view.y = dragStart.y + event.clientY - dragStart.pointerY;
      render();
    });

    function stopDragging(event) {
      if (!dragStart) return;
      dragStart = null;
      canvas.classList.remove('is-dragging');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
    canvas.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-flow-target]');
      if (trigger) focus(trigger.dataset.flowTarget);
    });

    canvas.querySelector('[data-zoom-in]').addEventListener('click', () => zoomFromCenter(1.2));
    canvas
      .querySelector('[data-zoom-out]')
      .addEventListener('click', () => zoomFromCenter(1 / 1.2));
    canvas.querySelector('[data-zoom-reset]').addEventListener('click', fit);

    canvas.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 80 : 32;
      if (event.key === 'ArrowLeft') view.x += step;
      else if (event.key === 'ArrowRight') view.x -= step;
      else if (event.key === 'ArrowUp') view.y += step;
      else if (event.key === 'ArrowDown') view.y -= step;
      else if (event.key === '+' || event.key === '=') zoomFromCenter(1.2);
      else if (event.key === '-') zoomFromCenter(1 / 1.2);
      else if (event.key === '0') fit();
      else return;
      event.preventDefault();
      render();
    });

    window.addEventListener('resize', fit);
    fit();

    return Object.freeze({ fit, focus });
  }

  globalScope.OneeFlowCanvas = Object.freeze({ mount });
})(globalThis);
