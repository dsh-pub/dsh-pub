(function attachPrototypeRuntime(globalScope) {
  function normalizeScreen(screen) {
    const fields = Object.freeze({ ...screen.fields });
    const actions = Object.freeze(
      Object.fromEntries(
        Object.entries(screen.actions).map(([actionName, action]) => [
          actionName,
          Object.freeze(
            action.target
              ? { label: action.label, target: action.target }
              : {
                  label: action.label,
                },
          ),
        ]),
      ),
    );

    return Object.freeze({ fields, actions });
  }

  function defineScreenModel(definition) {
    const screenIds = Object.freeze(Object.keys(definition.screens));
    const screens = Object.freeze(
      Object.fromEntries(
        Object.entries(definition.screens).map(([screenId, screen]) => [
          screenId,
          normalizeScreen(screen),
        ]),
      ),
    );

    if (!screenIds.includes(definition.entryScreenId)) {
      throw new Error(`Unknown prototype entry screen: ${definition.entryScreenId}`);
    }

    for (const screen of Object.values(screens)) {
      for (const action of Object.values(screen.actions)) {
        if (action.target && !screenIds.includes(action.target)) {
          throw new Error(`Unknown prototype action target: ${action.target}`);
        }
      }
    }

    return Object.freeze({
      entryScreenId: definition.entryScreenId,
      getScreen(screenId) {
        const screen = screens[screenId];
        if (!screen) throw new Error(`Unknown prototype screen: ${screenId}`);
        return screen;
      },
      screenIds,
    });
  }

  function elementsIncludingRoot(root, selector) {
    const elements = [...root.querySelectorAll(selector)];
    if (root.matches?.(selector)) elements.unshift(root);
    return elements;
  }

  function hydrateScreen(root, screen) {
    for (const fieldElement of elementsIncludingRoot(root, '[data-model-field]')) {
      const fieldName = fieldElement.dataset.modelField;
      const value = screen.fields[fieldName];
      if (typeof value !== 'string') {
        throw new Error(`Unknown prototype field: ${fieldName}`);
      }
      fieldElement.textContent = value;
    }

    for (const labelElement of elementsIncludingRoot(root, '[data-model-action-label]')) {
      const actionName = labelElement.dataset.modelActionLabel;
      const action = screen.actions[actionName];
      if (!action) throw new Error(`Unknown prototype action: ${actionName}`);
      labelElement.textContent = action.label;
    }

    for (const actionElement of elementsIncludingRoot(root, '[data-model-action]')) {
      const actionName = actionElement.dataset.modelAction;
      const action = screen.actions[actionName];
      if (!action) throw new Error(`Unknown prototype action: ${actionName}`);
      if (action.target) actionElement.dataset.flowTarget = action.target;
      else delete actionElement.dataset.flowTarget;
    }
  }

  function hydrateModel(root, model) {
    for (const screenElement of elementsIncludingRoot(root, '[data-model-screen]')) {
      hydrateScreen(screenElement, model.getScreen(screenElement.dataset.modelScreen));
    }
  }

  globalScope.OneePrototypeRuntime = Object.freeze({
    defineScreenModel,
    hydrateModel,
  });
})(globalThis);
