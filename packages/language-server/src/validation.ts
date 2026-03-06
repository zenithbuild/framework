export interface ValidationScheduler {
  schedule(uri: string): void;
  flush(uri: string): Promise<void>;
  clear(uri: string): void;
  dispose(): void;
  isLatest(uri: string, validationId: number): boolean;
}

interface ValidationState {
  timer: ReturnType<typeof setTimeout> | undefined;
  validationId: number;
}

export function createValidationScheduler(
  validate: (uri: string, validationId: number) => Promise<void>,
  delayMs = 150
): ValidationScheduler {
  const states = new Map<string, ValidationState>();

  function nextValidationId(uri: string): number {
    const state = states.get(uri) ?? { timer: undefined, validationId: 0 };
    state.validationId += 1;
    states.set(uri, state);
    return state.validationId;
  }

  function cancelTimer(uri: string): void {
    const state = states.get(uri);
    if (!state?.timer) {
      return;
    }
    clearTimeout(state.timer);
    state.timer = undefined;
  }

  return {
    schedule(uri) {
      const validationId = nextValidationId(uri);
      cancelTimer(uri);
      const state = states.get(uri)!;
      state.timer = setTimeout(() => {
        state.timer = undefined;
        void validate(uri, validationId);
      }, delayMs);
    },

    async flush(uri) {
      const validationId = nextValidationId(uri);
      cancelTimer(uri);
      await validate(uri, validationId);
    },

    clear(uri) {
      cancelTimer(uri);
      states.delete(uri);
    },

    dispose() {
      for (const uri of states.keys()) {
        cancelTimer(uri);
      }
      states.clear();
    },

    isLatest(uri, validationId) {
      return (states.get(uri)?.validationId ?? 0) === validationId;
    }
  };
}
