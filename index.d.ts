export type RouteResult =
    | { kind: "allow" }
    | { kind: "redirect"; location: string; status?: number }
    | { kind: "deny"; status: 401 | 403 | 500; message?: string }
    | { kind: "data"; data: any };

export type GuardResult = Extract<RouteResult, { kind: "allow" | "redirect" | "deny" }>;
export type LoadResult = Extract<RouteResult, { kind: "data" | "redirect" | "deny" }>;

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
        getSession(ctx: RouteContext): Promise<any>;
        requireSession(ctx: RouteContext): Promise<void>;
    };
    allow(): { kind: "allow" };
    redirect(location: string, status?: number): { kind: "redirect"; location: string; status: number };
    deny(status: 401 | 403 | 500, message?: string): { kind: "deny"; status: 401 | 403 | 500; message?: string };
    data(payload: any): { kind: "data"; data: any };
}

export declare function createRouter(config: { routes: any[]; container: HTMLElement }): { start: () => Promise<void>; destroy: () => void; };
export declare function navigate(path: string): Promise<void>;
export declare function back(): void;
export declare function forward(): void;
export declare function getCurrentPath(): string;
export declare function onRouteChange(listener: (event: any) => void): () => void;
export declare function matchRoute(routes: any[], path: string): any;

export interface RouteProtectionPolicy {
    onDeny?: "stay" | "redirect" | "render403" | ((ctx: any) => void);
    defaultLoginPath?: string;
    deny401RedirectToLogin?: boolean;
    forbiddenPath?: string;
}

export type RouteEventName =
    | "guard:start"
    | "guard:end"
    | "route-check:start"
    | "route-check:end"
    | "route-check:error"
    | "route:deny"
    | "route:redirect";

export declare function setRouteProtectionPolicy(policy: RouteProtectionPolicy): void;
export declare function on(eventName: RouteEventName, handler: (payload: any) => void): void;
export declare function off(eventName: RouteEventName, handler: (payload: any) => void): void;
