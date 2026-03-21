import "./globals.css";

export const metadata = {
  title: "Next Static Marketing Fixture",
  description: "Benchmark fixture",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <strong>Next Fixture</strong>
            <nav className="site-nav" aria-label="Primary">
              <a href="/">Home</a>
              <a href="/about">About</a>
              <a href="/contact">Contact</a>
            </nav>
          </header>
          <main className="site-main">{children}</main>
          <footer className="site-footer">Benchmark fixture footer.</footer>
        </div>
      </body>
    </html>
  );
}
