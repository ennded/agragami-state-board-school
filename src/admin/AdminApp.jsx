import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { defaults, mergeContent, useContent } from "../content.jsx";
import { api, getToken, setToken } from "./api.js";
import FieldEditor from "./FieldEditor.jsx";
import { allEditors, editors } from "./schemas.js";
import "./admin.css";

// Removes empty leftovers before saving: blank lines, empty rows, unused parts
// of a section. This keeps the pages from showing empty headings or tables.
function clean(v) {
  if (Array.isArray(v)) {
    const arr = v.map(clean).filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (v && typeof v === "object") {
    if ("head" in v && "rows" in v) {
      const head = (v.head || []).map((h) => String(h ?? "").trim());
      const rows = (v.rows || [])
        .map((r) => head.map((_, i) => String((r && r[i]) ?? "").trim()))
        .filter((r) => r.some(Boolean));
      return head.some(Boolean) || rows.length ? { head, rows } : undefined;
    }
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const c = clean(val);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof v === "string") return v.trim() === "" ? undefined : v.trim();
  return v === null ? undefined : v;
}

// The current value of one editor: the saved change if there is one, else the built-in content.
function valueFor(id, content) {
  if (id.startsWith("page:")) return content.pages[id.slice(5)];
  return content[id];
}

function Login({ onDone }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await api("/auth/login", { method: "POST", body: { email, password } });
      setToken(token);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-login">
      <form onSubmit={submit}>
        <h1>School admin</h1>
        <p>Log in to change the website content.</p>
        <label className="adm-label" htmlFor="adm-email">
          Username
        </label>
        <input id="adm-email" type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="adm-label" htmlFor="adm-password">
          Password
        </label>
        <input id="adm-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="adm-error">{error}</p>}
        <button className="adm-btn" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>
        <Link to="/">Back to the website</Link>
      </form>
    </div>
  );
}

function Account() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    try {
      await api("/auth/password", { method: "POST", body: { current, next } });
      setMsg({ ok: true, text: "Password changed." });
      setCurrent("");
      setNext("");
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  }

  return (
    <form onSubmit={submit} className="adm-narrow">
      <div className="adm-field">
        <label className="adm-label" htmlFor="adm-cur">
          Current password
        </label>
        <input id="adm-cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="adm-new">
          New password (8 or more characters)
        </label>
        <input id="adm-new" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      {msg && <p className={msg.ok ? "adm-ok" : "adm-error"}>{msg.text}</p>}
      <button className="adm-btn">Change password</button>
    </form>
  );
}

// Page addresses that are already taken by built-in parts of the site.
const RESERVED = ["admin", "gallery", "contact-us", "api", "uploads", "files"];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// A free page address for a new page: "sports-day", or "sports-day-2" if that is taken.
function freeSlug(title, pages) {
  const base = slugify(title) || "page";
  let s = base;
  for (let n = 2; s in pages || RESERVED.includes(s); n++) s = `${base}-${n}`;
  return s;
}

// The header menu as headers with the pages inside them. The admin adds headers,
// adds pages inside a header, and moves, renames or removes them. Every change is
// saved straight away.
function HeaderManager({ onOpenPage, onLoggedOut }) {
  const { pages, nav, reload } = useContent();
  const items = nav || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newHeader, setNewHeader] = useState("");
  const [addingTo, setAddingTo] = useState(null); // index of the header getting a new page
  const [pageTitle, setPageTitle] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [confirm, setConfirm] = useState(null); // index of the header to remove

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      if (err.status === 401) onLoggedOut();
      else setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const saveNav = (next) => api("/content/nav", { method: "PUT", body: { data: next } });

  async function addHeader(e) {
    e.preventDefault();
    const name = newHeader.trim();
    if (!name) return setError("Please type a name for the header.");
    if (items.some((n) => n.label.trim().toLowerCase() === name.toLowerCase()))
      return setError(`There is already a header called "${name}".`);
    if (await run(() => saveNav([...items, { label: name, children: [] }]))) setNewHeader("");
  }

  async function addPage(e, i) {
    e.preventDefault();
    const title = pageTitle.trim();
    if (!title) return setError("Please type a title for the page.");
    const slug = freeSlug(title, pages);
    const next = items.map((n, k) =>
      k === i ? { ...n, children: [...(n.children || []), { label: title, path: `/${slug}` }] } : n
    );
    const ok = await run(async () => {
      await api(`/content/page:${slug}`, { method: "PUT", body: { data: { light: "", bold: title, sections: [] } } });
      await saveNav(next);
    });
    if (ok) {
      setAddingTo(null);
      setPageTitle("");
    }
  }

  const move = (i, d) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    run(() => saveNav(next));
  };

  const rename = async (e, i) => {
    e.preventDefault();
    const name = renameText.trim();
    if (!name) return;
    if (await run(() => saveNav(items.map((n, k) => (k === i ? { ...n, label: name } : n))))) setRenaming(null);
  };

  const removeHeader = (i) => {
    setConfirm(null);
    run(() => saveNav(items.filter((_, k) => k !== i)));
  };

  const removeLink = (i, j) =>
    run(() =>
      saveNav(items.map((n, k) => (k === i ? { ...n, children: n.children.filter((_, x) => x !== j) } : n)))
    );

  return (
    <div className="adm-hm">
      <form className="adm-hm__card adm-hm__add" onSubmit={addHeader}>
        <label className="adm-label" htmlFor="hm-new">
          Add a new header
        </label>
        <div className="adm-hm__inline">
          <input
            id="hm-new"
            type="text"
            placeholder="Header name, e.g. Activities"
            value={newHeader}
            onChange={(e) => setNewHeader(e.target.value)}
          />
          <button className="adm-btn" disabled={busy}>
            + Add header
          </button>
        </div>
        <p className="adm-help">
          It is added at the end of the header. Then use "+ Add page" on it below. If there are more headers than fit,
          the extra ones go into a "More" menu on the website automatically.
        </p>
      </form>

      {error && <p className="adm-error">{error}</p>}

      <h2 className="adm-hm__title">Your headers</h2>

      {items.map((n, i) => {
        const isLink = Boolean(n.path);
        const children = n.children || [];
        return (
          <section key={i} className="adm-hm__card">
            <div className="adm-hm__head">
              {renaming === i ? (
                <form className="adm-hm__inline" onSubmit={(e) => rename(e, i)}>
                  <input autoFocus type="text" value={renameText} onChange={(e) => setRenameText(e.target.value)} />
                  <button className="adm-btn" disabled={busy}>Save</button>
                  <button type="button" className="adm-btn adm-btn--light" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <h2>
                  {n.label}
                  {isLink && <small> — single link to {n.path}</small>}
                </h2>
              )}
              <span className="adm-spacer" />
              <button className="adm-hm__icon" title="Move left in the header" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button
                className="adm-hm__icon"
                title="Move right in the header"
                disabled={busy || i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                className="adm-link"
                onClick={() => {
                  setRenaming(i);
                  setRenameText(n.label);
                }}
              >
                Rename
              </button>
              {confirm === i ? (
                <>
                  <button className="adm-btn adm-btn--danger" disabled={busy} onClick={() => removeHeader(i)}>
                    Yes, remove
                  </button>
                  <button className="adm-btn adm-btn--light" onClick={() => setConfirm(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button className="adm-link" onClick={() => setConfirm(i)}>
                  Remove
                </button>
              )}
            </div>
            {confirm === i && (
              <p className="adm-note">
                This removes the header from the menu. Its pages are kept and can still be edited from the left.
              </p>
            )}

            {!isLink && (
              <>
                {children.length === 0 ? (
                  <p className="adm-note">No pages yet. The header shows on the website once it has a page.</p>
                ) : (
                  <ul className="adm-hm__pages">
                    {children.map((c, j) => {
                      const slug = c.path?.replace(/^\//, "");
                      return (
                        <li key={j}>
                          <span>{c.label}</span>
                          <small>{c.path}</small>
                          <span className="adm-spacer" />
                          {slug in pages && (
                            <button className="adm-link" onClick={() => onOpenPage(`page:${slug}`)}>
                              Edit page
                            </button>
                          )}
                          <button className="adm-link" disabled={busy} onClick={() => removeLink(i, j)}>
                            Remove from header
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {addingTo === i ? (
                  <form className="adm-hm__inline" onSubmit={(e) => addPage(e, i)}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Page title, e.g. Sports Day"
                      value={pageTitle}
                      onChange={(e) => setPageTitle(e.target.value)}
                    />
                    <button className="adm-btn" disabled={busy}>
                      {busy ? "Adding..." : "Add page"}
                    </button>
                    <button type="button" className="adm-btn adm-btn--light" onClick={() => setAddingTo(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    className="adm-btn adm-btn--light"
                    onClick={() => {
                      setAddingTo(i);
                      setPageTitle("");
                      setError("");
                    }}
                  >
                    + Add page to {n.label}
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

    </div>
  );
}

function Editor({ editor, onLoggedOut, onDeleted }) {
  const content = useContent();
  const { saved, reload } = content;
  const original = valueFor(editor.id, content);
  const [draft, setDraft] = useState(original);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const isChanged = editor.id in saved;

  // warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // the success toast dismisses itself after a few seconds
  useEffect(() => {
    if (!status?.ok) return;
    const id = setTimeout(() => setStatus(null), 3000);
    return () => clearTimeout(id);
  }, [status]);

  async function run(action, doneText) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      await reload();
      setDirty(false);
      setStatus({ ok: true, text: doneText });
    } catch (err) {
      if (err.status === 401) return onLoggedOut();
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    const data = clean(draft) ?? (editor.type === "object" ? {} : editor.type === "textarea" ? "" : []);
    return run(() => api(`/content/${editor.id}`, { method: "PUT", body: { data } }), "Saved. The website is updated.");
  };

  // A page the admin added: delete it and take it out of the menu.
  const removePage = async () => {
    const path = `/${editor.id.slice(5)}`;
    const strip = (items) =>
      (items || [])
        .filter((n) => n.path !== path)
        .map((n) => (n.children ? { ...n, children: n.children.filter((c) => c.path !== path) } : n));
    setBusy(true);
    try {
      await api(`/content/${editor.id}`, { method: "DELETE" });
      const nav = strip(content.nav);
      if (JSON.stringify(nav) !== JSON.stringify(content.nav)) {
        await api("/content/nav", { method: "PUT", body: { data: nav } });
      }
      await reload();
      onDeleted();
    } catch (err) {
      setBusy(false);
      if (err.status === 401) return onLoggedOut();
      setStatus({ ok: false, text: err.message });
    }
  };

  const reset = async () => {
    await run(() => api(`/content/${editor.id}`, { method: "DELETE" }), "Back to the original content.");
    const id = editor.id;
    setDraft(id.startsWith("page:") ? defaults.pages[id.slice(5)] : mergeContent({})[id]);
  };

  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      {status?.ok && (
        <div className="adm-toast" role="status">
          <svg className="adm-toast__icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {status.text}
        </div>
      )}

      <div className="adm-editor">
        <FieldEditor
          field={{ ...editor, label: undefined, help: undefined }}
          value={draft}
          onChange={(v) => {
            setDraft(v);
            setDirty(true);
            setStatus(null);
          }}
        />
      </div>

      <div className="adm-savebar">
        <button className="adm-btn" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving..." : "Save changes"}
        </button>
        {dirty && <span className="adm-note">You have unsaved changes.</span>}
        {status && !status.ok && <span className="adm-error">{status.text}</span>}
        <span className="adm-spacer" />
        {isChanged &&
          (confirmReset ? (
            <>
              <span className="adm-note">
                {editor.custom
                  ? "Delete this page and remove it from the menu?"
                  : "Remove your changes to this section?"}
              </span>
              <button
                className="adm-btn adm-btn--danger"
                disabled={busy}
                onClick={() => {
                  setConfirmReset(false);
                  editor.custom ? removePage() : reset();
                }}
              >
                {editor.custom ? "Yes, delete" : "Yes, reset"}
              </button>
              <button className="adm-btn adm-btn--light" onClick={() => setConfirmReset(false)}>
                {editor.custom ? "Keep it" : "Keep them"}
              </button>
            </>
          ) : (
            <button className="adm-btn adm-btn--light" disabled={busy} onClick={() => setConfirmReset(true)}>
              {editor.custom ? "Delete this page" : "Reset to original"}
            </button>
          ))}
      </div>
    </>
  );
}

export default function AdminApp() {
  const [state, setState] = useState(getToken() ? "checking" : "out");
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState(editors[0].id);
  const [menuOpen, setMenuOpen] = useState(false);
  const content = useContent();
  const { saved, reload } = content;

  const logout = () => {
    setToken("");
    setState("out");
  };

  // check that the saved login is still valid
  useEffect(() => {
    if (state !== "checking") return;
    // also load the newest saved content before showing any form
    Promise.all([api("/auth/me"), reload()])
      .then(([d]) => {
        setEmail(d.email);
        setState("in");
      })
      .catch(logout);
  }, [state]);

  const list = useMemo(() => allEditors(content), [content]);

  const groups = useMemo(() => {
    const out = [];
    for (const e of list) {
      let g = out.find((x) => x.name === e.group);
      if (!g) out.push((g = { name: e.group, items: [] }));
      g.items.push(e);
    }
    return out;
  }, [list]);

  if (state === "out") return <Login onDone={() => setState("checking")} />;
  if (state === "checking") return <p className="adm-loading">Loading...</p>;

  const editor = list.find((e) => e.id === current);
  const pick = (id) => {
    setCurrent(id);
    setMenuOpen(false);
  };

  return (
    <div className="adm">
      <header className="adm-top">
        <button className="adm-menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
          Menu
        </button>
        <strong>School admin</strong>
        <span className="adm-spacer" />
        <Link to="/" target="_blank">
          View website
        </Link>
        <button className="adm-link" onClick={logout}>
          Log out
        </button>
      </header>

      <div className="adm-body">
        <nav className={`adm-side ${menuOpen ? "is-open" : ""}`}>
          <div>
            <h2>Header</h2>
            <button className={current === "headers" ? "is-active" : ""} onClick={() => pick("headers")}>
              Headers and pages
            </button>
          </div>
          {groups.map((g) => (
            <div key={g.name}>
              <h2>{g.name}</h2>
              {g.items.map((e) => (
                <button
                  key={e.id}
                  className={current === e.id ? "is-active" : ""}
                  onClick={() => {
                    setCurrent(e.id);
                    setMenuOpen(false);
                  }}
                >
                  {e.title}
                  {e.id in saved && <i title="You have changed this section" />}
                </button>
              ))}
            </div>
          ))}
          <div>
            <h2>Account</h2>
            <button
              className={current === "account" ? "is-active" : ""}
              onClick={() => {
                setCurrent("account");
                setMenuOpen(false);
              }}
            >
              Change password
            </button>
          </div>
        </nav>

        <main className="adm-main">
          {current === "account" ? (
            <>
              <h1>Change password</h1>
              <p className="adm-help">Logged in as {email}</p>
              <Account />
            </>
          ) : current === "headers" ? (
            <>
              <h1>Headers and pages</h1>
              <p className="adm-help">
                The headers shown at the top of the website, in order, with the pages inside each one. Changes are
                saved straight away.
              </p>
              <HeaderManager onOpenPage={pick} onLoggedOut={logout} />
            </>
          ) : editor ? (
            <>
              <h1>{editor.title}</h1>
              {editor.help && <p className="adm-help">{editor.help}</p>}
              {/* "key" gives each section its own fresh form */}
              <Editor key={editor.id} editor={editor} onLoggedOut={logout} onDeleted={() => pick(editors[0].id)} />
            </>
          ) : (
            <p className="adm-help">This section no longer exists. Pick another one from the menu.</p>
          )}
        </main>
      </div>
    </div>
  );
}
