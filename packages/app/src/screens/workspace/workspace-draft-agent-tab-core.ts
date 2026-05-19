export interface WorkspaceDraftAutoSubmitConfig {
  provider: string;
  model: string | null;
}

export function validateDraftSubmission(input: {
  text: string;
  allowsEmptyAutoSubmit: boolean;
  composerState: {
    providerDefinitions: unknown[];
    selectedProvider: string | null;
    isModelLoading: boolean;
    effectiveModelId: string | null;
    availableModels: unknown[];
  };
  autoSubmitConfig: WorkspaceDraftAutoSubmitConfig | null;
  workspaceDirectory: string | null;
  hasClient: boolean;
}): string | null {
  const {
    text,
    allowsEmptyAutoSubmit,
    composerState,
    autoSubmitConfig,
    workspaceDirectory,
    hasClient,
  } = input;
  if (!allowsEmptyAutoSubmit && !text.trim()) {
    return "Initial prompt is required";
  }
  if (composerState.providerDefinitions.length === 0) {
    return "No available providers on the selected host";
  }
  if (!(autoSubmitConfig?.provider ?? composerState.selectedProvider)) {
    return "Select a model";
  }
  if (composerState.isModelLoading) {
    return "Model defaults are still loading";
  }
  const hasSelectedModel = Boolean(autoSubmitConfig?.model ?? composerState.effectiveModelId);
  if (!hasSelectedModel && composerState.availableModels.length > 0) {
    return "No model is available for the selected provider";
  }
  if (!workspaceDirectory) {
    return "Workspace directory not found";
  }
  if (!hasClient) {
    return "Host is not connected";
  }
  return null;
}
