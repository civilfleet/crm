export function SiteHeader() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="utility-bar">
        <div className="site-container">Sea-Watch · Events</div>
      </div>
      <header className="site-header">
        <div className="site-container header-inner">
          <a
            className="brand-link"
            href="https://sea-watch.org/"
            aria-label="Sea-Watch homepage"
          >
            {/* The official vector mark is served locally, without an image proxy. */}
            {/* biome-ignore lint/performance/noImgElement: static SVG brand asset */}
            <img
              src="/brand/sea-watch-mark.svg"
              width="75"
              height="68"
              alt="Sea-Watch"
            />
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            <a className="nav-current" href="/">
              Events
            </a>
            <a href="https://sea-watch.org/">Sea-Watch.org</a>
            <a className="donate-link" href="https://sea-watch.org/spenden/">
              Donate
            </a>
          </nav>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container footer-inner">
        <a className="footer-name" href="https://sea-watch.org/">
          Sea-Watch e.V.
        </a>
        <nav aria-label="Footer navigation">
          <a href="https://sea-watch.org/ueber-uns/kontakt/">Contact</a>
          <a href="https://sea-watch.org/impressum/datenschutz/">Privacy</a>
          <a href="https://sea-watch.org/impressum/">Legal notice</a>
        </nav>
      </div>
    </footer>
  );
}
