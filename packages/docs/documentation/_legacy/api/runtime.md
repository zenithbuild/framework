# @zenithbuild/runtime API Reference

The Zenith Runtime is a "dumb" execution layer. It does not possess parsing logic or virtual DOM capabilities. It strictly obeys the instructions emitted by the compiler.

## Reactivity Primitives

Zenith uses auto-tracked reactivity. You do NOT need dependency arrays.

### `signal<T>(value: T): Signal<T>`
Creates a reactive primitive.
```ts
const count = signal(0);
count(count() + 1); // Update
console.log(count()); // Read
```

### `state<T extends object>(obj: T): T`
Creates a reactive proxy for deeply nested objects.
```ts
const user = state({ name: 'Zenith', meta: { score: 10 } });
user.meta.score++; // Triggered automatically
```

### `effect(fn: () => void | (() => void)): DisposeFn`
Runs a function and tracks its dependencies. Cleans up when dependencies change or the component unmounts.
```ts
effect(() => {
  console.log('Score is now:', user.meta.score);
});
```

### `memo<T>(fn: () => T): Signal<T>`
Computes a value based on other reactive signals.
```ts
const double = memo(() => count() * 2);
```

## Lifecycle Hooks

### `onMount(cb: () => void): void`
Runs strictly once when the component is hydrated in the browser.

### `onUnmount(cb: () => void): void`
Runs when the component is being removed from the DOM.

## Internal Authority Primitives

These are used by the compiled output and should generally not be used in hand-written code unless building library extensions.

### `registerInstructions(table: Record<string, Function>)`
The ONLY way to map symbolic string handles (e.g., `"onclick": "inc"`) to executable code. The table is frozen after initialization.

### `zenithHydrate(state: any, container?: HTMLElement)`
Bootstraps the compiled IR into a live environment.
