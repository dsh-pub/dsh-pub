/* global document, window */

(function hydrateMobileFlow() {
  const runtime = window.OneePrototypeRuntime;
  const screenModel = window.OneeProductScreenModel;
  if (!runtime || !screenModel || !window.OneeFlowCanvas) return;

  runtime.hydrateModel(document, screenModel);

  const canvas = document.querySelector('[data-flow-canvas]');
  const world = document.querySelector('[data-flow-world]');
  window.OneeFlowCanvas.mount({
    canvas,
    world,
    worldSize: {
      width: Number(world.dataset.worldWidth),
      height: Number(world.dataset.worldHeight),
    },
  });
})();
