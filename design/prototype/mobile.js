/* global document, window */

(function hydrateMobilePrototype() {
  const runtime = window.OneePrototypeRuntime;
  const screenModel = window.OneeProductScreenModel;
  if (!runtime || !screenModel) return;

  runtime.hydrateModel(document, screenModel);
})();
