import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useContent } from "../content.jsx";

// The wide-screen layout (menu in one row). Below this the menu button is used.
const WIDE = "(min-width: 1280px)";

// A header is shown when it is a link, or a dropdown with at least one page.
const usable = (item) => item && item.label && (item.path || (item.children && item.children.length));

function Caret() {
  return (
    <svg viewBox="0 0 10 6" className="nav__caret" aria-hidden="true">
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// One header in the bar: a plain link, or a dropdown with its pages.
function NavItem({ item, index, openItem, setOpenItem, pathname }) {
  if (!item.children || !item.children.length) {
    return (
      <li className="nav__item">
        <NavLink to={item.path} end className={({ isActive }) => `nav__link ${isActive ? "is-active" : ""}`}>
          {item.label}
        </NavLink>
      </li>
    );
  }
  const groupActive = item.children.some((c) => c.path === pathname);
  return (
    <li className={`nav__item has-children ${openItem === index ? "is-open" : ""}`}>
      <button
        className={`nav__link ${groupActive ? "is-active" : ""}`}
        aria-expanded={openItem === index}
        onClick={() => setOpenItem(openItem === index ? null : index)}
      >
        {item.label}
        <Caret />
      </button>
      <ul className="dropdown">
        {item.children.map((c) => (
          <li key={c.path + c.label}>
            <NavLink to={c.path}>{c.label}</NavLink>
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function Header() {
  const { school, nav } = useContent();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openItem, setOpenItem] = useState(null); // used on mobile only
  // Tries the local logo first, then the old site, then a placeholder.
  const [logoState, setLogoState] = useState("local");

  const items = (nav || []).filter(usable);
  const isDropdown = (item) => Boolean(item.children && item.children.length);

  // How many headers fit in the bar. The rest go into a "More" dropdown.
  const [fit, setFit] = useState(items.length);
  const navRef = useRef(null);
  const measureRef = useRef(null);
  const labelsKey = items.map((i) => i.label).join("|");

  useLayoutEffect(() => {
    const navEl = navRef.current;
    const measure = measureRef.current;
    if (!navEl || !measure) return;

    const update = () => {
      const count = measure.children.length - 1;
      if (!window.matchMedia(WIDE).matches) return setFit(count);
      const widths = [...measure.children].map((li) => li.getBoundingClientRect().width);
      const moreWidth = widths.pop(); // the last measured item is the "More" button
      const space = navEl.getBoundingClientRect().width;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= space) return setFit(count);
      let used = moreWidth;
      let n = 0;
      while (n < widths.length && used + widths[n] <= space) used += widths[n++];
      setFit(n);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(navEl);
    // fonts can load after the first measure and change the widths
    document.fonts?.ready.then(update);
    return () => ro.disconnect();
  }, [labelsKey]);

  // Close the mobile menu whenever the page changes.
  useEffect(() => {
    setMenuOpen(false);
    setOpenItem(null);
  }, [pathname]);

  const shown = items.slice(0, fit);
  const extra = items.slice(fit);
  const extraActive = extra.some(
    (i) => i.path === pathname || (i.children || []).some((c) => c.path === pathname)
  );

  return (
    <>
      <div className="topbar">
        <div className="container topbar__inner">
          <p>
            Call us on:{" "}
            {school.phones.map((p, i) => (
              <span key={p}>
                <a href={`tel:${p}`}>{p}</a>
                {i < school.phones.length - 1 ? ", " : ""}
              </span>
            ))}
            <span className="topbar__sep">|</span>
            <a href={`mailto:${school.email}`}>{school.email}</a>
          </p>
          <p className="topbar__note">{school.affiliation}</p>
        </div>
      </div>

      <header className="header">
        <div className="container header__inner">
          <Link to="/" className="brand">
            {logoState === "none" ? (
              <span className="brand__logo brand__logo--placeholder">Logo</span>
            ) : (
              <img
                src={logoState === "local" ? school.logo : school.logoRemote}
                alt={`${school.name} logo`}
                className="brand__logo"
                onError={() => setLogoState(logoState === "local" ? "remote" : "none")}
              />
            )}
            <span className="brand__text">
              <strong className="brand__name">{school.name}</strong>
              <small className="brand__tag">{school.place}</small>
            </span>
          </Link>

          <button
            className="menu-btn"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav ref={navRef} className={`nav ${menuOpen ? "nav--open" : ""}`}>
            <ul>
              {shown.map((item, i) => (
                <NavItem
                  key={item.label + i}
                  item={item}
                  index={i}
                  openItem={openItem}
                  setOpenItem={setOpenItem}
                  pathname={pathname}
                />
              ))}
              {extra.length > 0 && (
                <li className={`nav__item has-children nav__more ${openItem === "more" ? "is-open" : ""}`}>
                  <button
                    className={`nav__link ${extraActive ? "is-active" : ""}`}
                    aria-expanded={openItem === "more"}
                    onClick={() => setOpenItem(openItem === "more" ? null : "more")}
                  >
                    More
                    <Caret />
                  </button>
                  <ul className="dropdown">
                    {extra.map((item, i) =>
                      isDropdown(item) ? (
                        <li key={item.label + i} className="dropdown__group">
                          <span className="dropdown__heading">{item.label}</span>
                          <ul>
                            {item.children.map((c) => (
                              <li key={c.path + c.label}>
                                <NavLink to={c.path}>{c.label}</NavLink>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ) : (
                        <li key={item.label + i}>
                          <NavLink to={item.path} end>
                            {item.label}
                          </NavLink>
                        </li>
                      )
                    )}
                  </ul>
                </li>
              )}
            </ul>

            {/* Hidden copy of every header, used only to measure how many fit in the bar. */}
            <ul ref={measureRef} className="nav__measure" aria-hidden="true">
              {items.map((item, i) => (
                <li key={item.label + i} className="nav__item">
                  <span className="nav__link">
                    {item.label}
                    {isDropdown(item) && <Caret />}
                  </span>
                </li>
              ))}
              <li className="nav__item">
                <span className="nav__link">
                  More
                  <Caret />
                </span>
              </li>
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}
