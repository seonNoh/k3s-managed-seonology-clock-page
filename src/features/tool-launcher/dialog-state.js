export function openTool(state, toolId, returnTarget = 'dashboard') {
  return {
    ...state,
    toolsExpanded: false,
    activeToolId: toolId,
    activeModal: null,
    toolReturnTarget: returnTarget,
  };
}

export const openToolDialog = openTool;

export function openToolLauncher(state) {
  return {
    ...state,
    toolsExpanded: true,
    activeToolId: null,
    activeModal: null,
    toolReturnTarget: null,
  };
}

export function closeTopDialog(state) {
  if (state.activeToolId) {
    return {
      ...state,
      toolsExpanded: state.toolReturnTarget === 'launcher',
      activeToolId: null,
      toolReturnTarget: null,
    };
  }
  if (state.toolsExpanded) return { ...state, toolsExpanded: false };
  if (state.activeModal) return { ...state, activeModal: null };
  return state;
}

export function filterToolCatalog(tools, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tools;

  return tools.filter((tool) => {
    const searchable = [tool.id, tool.name, ...(tool.aliases || [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return searchable.includes(normalized);
  });
}
