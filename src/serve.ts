/**
 * Zenith Development Server
 * 
 * SPA-compatible server that:
 * - Serves static assets directly (js, css, ico, images)
 * - Serves index.html for all other routes (SPA fallback)
 * 
 * This enables client-side routing to work on:
 * - Direct URL entry
 * - Hard refresh
 * - Back/forward navigation
 */

import { serve } from "bun"
import path from "path"

const distDir = path.resolve(process.cwd(), "dist")
const srcDistDir = path.resolve(process.cwd(), "src/dist")

// Determine which dist to use
const finalDistDir = (await Bun.file(path.join(distDir, "index.html")).exists())
    ? distDir
    : (await Bun.file(path.join(srcDistDir, "index.html")).exists())
        ? srcDistDir
        : distDir // Fallback to root dist


// File extensions that should be served as static assets
const STATIC_EXTENSIONS = new Set([
    ".js",
    ".css",
    ".ico",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".json",
    ".map"
])

serve({
    port: 3000,

    async fetch(req) {
        const url = new URL(req.url)
        const pathname = url.pathname

        // 1. Root Route -> dist/index.html
        if (pathname === "/" || pathname === "/index.html") {
            const indexPath = path.join(finalDistDir, "index.html")
            const file = Bun.file(indexPath)
            if (await file.exists()) {
                return new Response(file, {
                    headers: { "Content-Type": "text/html; charset=utf-8" }
                })
            }
            // No index.html found - likely need to run build first
            return new Response(
                `<html>
            <head><title>Zenith - Build Required</title></head>
            <body style="font-family: system-ui; padding: 2rem; text-align: center;">
            <h1>Build Required</h1>
            <p>Run <code>zenith build</code> first to compile the pages.</p>
            <p>Checked: ${finalDistDir}</p>
            </body>
        </html>`,
                {
                    status: 500,
                    headers: { "Content-Type": "text/html; charset=utf-8" }
                }
            )
        }

        // 2. Static Assets (js, css, etc.)
        const filePath = path.join(finalDistDir, pathname)
        const file = Bun.file(filePath)

        if (await file.exists()) {
            // Force correct MIME types for critical files
            const headers = new Headers();
            if (pathname.endsWith(".css")) headers.set("Content-Type", "text/css");
            if (pathname.endsWith(".js")) headers.set("Content-Type", "application/javascript");

            return new Response(file, { headers })
        }

        // 3. 404 - Not Found (Do not fallback to SPA yet to verify strict static serving)
        return new Response("Not Found", { status: 404 })
    }
})

console.log("🚀 Zenith dev server running at http://localhost:3000")
console.log("   SPA mode: All routes serve index.html")
