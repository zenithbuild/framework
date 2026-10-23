export type RouteDownloadBody = string | Uint8Array | ArrayBuffer;

export interface RouteDownloadOptions {
    filename: string;
    contentType?: string;
}

export type RouteResult =
    | { kind: "allow" }
    | { kind: "redirect"; location: string; status?: number }
    | { kind: "deny"; status: 401 | 403 | 404; message?: string }
    | { kind: "data"; data: any }
    | { kind: "invalid"; data: any; status: 400 | 422 }
    | { kind: "json"; data: any; status?: number }
    | { kind: "text"; body: string; status?: number }
    | { kind: "download"; filename: string; contentType: string; status?: 200 };

export type GuardResult = Extract<RouteResult, { kind: "allow" | "redirect" | "deny" }>;
export type LoadResult = Extract<RouteResult, { kind: "data" | "redirect" | "deny" }>;
export type RouteSession = Record<string, unknown>;
export type RequireSessionOptions =
    | { redirectTo: string; status?: 302 | 303 | 307 }
    | { deny: 401 | 403 | 404; message?: string };

export interface RouteContext {
    params: Record<string, string>;
    url: URL;
    headers: Record<string, string>;
    cookies: Record<string, string>;
    request: Request;
    method: string;
    route: { id: string; pattern: string; file: string };
    env: Record<string, string>;
    auth: {
        getSession(): Promise<RouteSession | null>;
        requireSession(options: RequireSessionOptions): Promise<RouteSession>;
        signIn(sessionObject: RouteSession): Promise<void>;
        signOut(): Promise<void>;
    };
    allow(): { kind: "allow" };
    redirect(location: string, status?: number): { kind: "redirect"; location: string; status: number };
    deny(status: 401 | 403 | 404, message?: string): { kind: "deny"; status: 401 | 403 | 404; message?: string };
    data(payload: any): { kind: "data"; data: any };
    invalid(payload: any, status?: 400 | 422): { kind: "invalid"; data: any; status: 400 | 422 };
    json(payload: any, status?: number): { kind: "json"; data: any; status: number };
    text(body: string, status?: number): { kind: "text"; body: string; status: number };
    download(body: RouteDownloadBody, options: RouteDownloadOptions): { kind: "download"; filename: string; contentType: string; status: 200 };
}

export declare function createRouter(config: { routes: any[]; container: HTMLElement }): { start: () => Promise<void>; destroy: () => void; };
export declare function navigate(path: string): Promise<void>;
export declare function refreshCurrentRoute(): Promise<void>;
export declare function back(): void;
export declare function forward(): void;
export declare function getCurrentPath(): string;
export declare function onRouteChange(listener: (event: any) => void): () => void;
export declare function matchRoute(routes: any[], path: string): any;

export interface AdvisoryRoutePolicy {
    onDeny?: "stay" | "redirect" | "render403" | ((ctx: any) => void);
    defaultLoginPath?: string;
    deny401RedirectToLogin?: boolean;
    forbiddenPath?: string;
}

/** @deprecated Use AdvisoryRoutePolicy. This policy only controls client navigation UX. */
export type RouteProtectionPolicy = AdvisoryRoutePolicy;

export type NavigationType = "push" | "pop" | "refresh";
export type NavigationShellPhase = "idle" | "leaving" | "swapping" | "entering";

export interface NavigationShellState {
    phase: NavigationShellPhase;
    navigationId: number | null;
    navigationType: NavigationType | null;
}

export interface NavigationShellOptions {
    timeoutMs?: number;
    onStateChange?: (state: NavigationShellState, context: { previousState: NavigationShellState }) => void;
}

export interface NavigationShellController {
    mount(): () => void;
    destroy(): void;
    getPhase(): NavigationShellPhase;
    getState(): NavigationShellState;
}

export interface NavigationLifecyclePayload {
    navigationId: number;
    navigationType: NavigationType;
    to: URL | null;
    from: URL | null;
    routeId: string;
    params: Record<string, string>;
    stage: string;
    document?: {
        title: string;
        hasSsrData: boolean;
        status: number;
    };
    scroll?: {
        mode: "top" | "restore" | "hash";
        x: number;
        y: number;
        hash: string;
    };
    reason?: string;
    hook?: string;
    location?: string;
    status?: number;
    historyCommitted?: boolean;
    error?: unknown;
    [key: string]: unknown;
}

export type RouteEventHandler = (payload: unknown) => void | Promise<void>;

export type RouteEventName =
    | "route-check:start"
    | "route-check:end"
    | "route-check:error"
    | "route:deny"
    | "route:redirect"
    | "navigation:request"
    | "navigation:before-leave"
    | "navigation:leave-complete"
    | "navigation:data-ready"
    | "navigation:before-swap"
    | "navigation:content-swapped"
    | "navigation:before-enter"
    | "navigation:enter-complete"
    | "navigation:abort"
    | "navigation:error";

export declare function setAdvisoryRoutePolicy(policy: AdvisoryRoutePolicy): void;
export declare function _getAdvisoryRoutePolicy(): AdvisoryRoutePolicy;
/** @deprecated Use setAdvisoryRoutePolicy. This policy only controls client navigation UX. */
export declare function setRouteProtectionPolicy(policy: RouteProtectionPolicy): void;
/** @deprecated Use _getAdvisoryRoutePolicy. This policy only controls client navigation UX. */
export declare function _getRouteProtectionPolicy(): RouteProtectionPolicy;
export declare function on(eventName: RouteEventName, handler: RouteEventHandler): void;
export declare function off(eventName: RouteEventName, handler: RouteEventHandler): void;
export declare function zenNavigationShell(ref: { current?: Element | null }, options?: NavigationShellOptions | null): NavigationShellController;
