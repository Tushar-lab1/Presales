import { useState, useRef, useEffect } from "react";
import {
  Search,
  HelpCircle,
  Menu,
  Plus,
  ChevronDown,
  ChevronRight,
  LogOut,
  Trash2,
  X,
  ArrowLeft,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── highlight matching text ───────────────────────────────────────────────────
function highlight(text, query) {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 120);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  const before = (start > 0 ? "…" : "") + text.slice(start, idx);
  const match = text.slice(idx, idx + query.length);
  const after =
    text.slice(idx + query.length, end) + (end < text.length ? "…" : "");
  return { before, match, after };
}

function HighlightedSnippet({ text, query }) {
  const parts = highlight(text, query);
  if (typeof parts === "string") return <span>{parts}</span>;
  return (
    <span>
      {parts.before}
      <mark
        style={{
          background: "#c8a96e40",
          color: "#1a1a18",
          borderRadius: "2px",
          padding: "0 1px",
        }}
      >
        {parts.match}
      </mark>
      {parts.after}
    </span>
  );
}

// ── Search panel ──────────────────────────────────────────────────────────────
function SearchPanel({ user, workspaces, setActiveWorkspace, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = async (q) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch(
        `${API}/chat/search?email=${encodeURIComponent(user.email)}&q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      const data = await resp.json();
      setResults(data.results || []);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 350);
  };

  const handleJump = (result) => {
    const ws = workspaces.find((w) => w.id === result.workspace_id);
    if (ws) setActiveWorkspace(ws);
    onClose();
  };

  return (
    <div className="search-panel">
      {/* Search input */}
      <div className="search-input-row">
        <button className="search-back-btn" onClick={onClose} title="Back">
          <ArrowLeft size={15} />
        </button>
        <div className="search-input-wrap">
          <Search size={13} className="search-icon-inner" />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search chats…"
            value={query}
            onChange={handleChange}
          />
          {query && (
            <button
              className="search-clear"
              onClick={() => {
                setQuery("");
                setResults([]);
                setSearched(false);
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="search-results">
        {loading && <p className="search-status">Searching…</p>}

        {!loading && searched && results.length === 0 && (
          <p className="search-status">No results for "{query}"</p>
        )}

        {!loading &&
          results.map((r) => (
            <button
              key={r.chat_id}
              className="search-result-item"
              onClick={() => handleJump(r)}
            >
              <div className="sr-workspace">
                <span className="sr-ws-dot" />
                {r.workspace_name}
                <span className="sr-client-id">{r.client_id}</span>
              </div>
              <p className="sr-query">
                <HighlightedSnippet text={r.user_query} query={query} />
              </p>
              <p className="sr-response">
                <HighlightedSnippet text={r.model_response} query={query} />
              </p>
              <span className="sr-date">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </button>
          ))}

        {!loading && !searched && (
          <p className="search-status">Type to search across all workspaces</p>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  setShowDialog,
  user,
  onLogout,
  workspaces,
  loadingWorkspaces,
  activeWorkspace,
  setActiveWorkspace,
  onDeleteWorkspace,
}) {
  const [showWorkspaces, setShowWorkspaces] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [hoveredWs, setHoveredWs] = useState(null);
  const [deletingWs, setDeletingWs] = useState(null);

  const handleDelete = async (e, ws) => {
    e.stopPropagation();
    if (
      !confirm(
        `Delete workspace "${ws.name}"?\n\nThis will permanently delete all documents, chunks and chat history inside it.`,
      )
    )
      return;
    setDeletingWs(ws.id);
    await onDeleteWorkspace(ws.id);
    setDeletingWs(null);
  };

  // ── Collapsed sidebar ─────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="sidebar-collapsed">
        <button className="icon-btn" onClick={() => setCollapsed(false)}>
          <Menu size={18} />
        </button>
        <div className="collapsed-actions">
          <button
            className="icon-btn"
            onClick={() => {
              setCollapsed(false);
              setShowSearch(true);
            }}
            title="Search"
          >
            <Search size={18} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowDialog(true)}
            title="New Workspace"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="collapsed-avatar" onClick={onLogout} title="Sign out">
          {user?.avatar}
        </div>
        <style>{css}</style>
      </div>
    );
  }

  // ── Search mode ───────────────────────────────────────────────────────────
  if (showSearch) {
    return (
      <div className="sidebar">
        <SearchPanel
          user={user}
          workspaces={workspaces}
          setActiveWorkspace={setActiveWorkspace}
          onClose={() => setShowSearch(false)}
        />
        <style>{css}</style>
      </div>
    );
  }

  // ── Normal sidebar ────────────────────────────────────────────────────────
  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <div className="brand-hex">⬡</div>
          <span className="brand-text">Presales AI</span>
        </div>
        <button className="icon-btn" onClick={() => setCollapsed(true)}>
          <Menu size={18} />
        </button>
      </div>

      <div className="sidebar-section">
        <button
          className="new-workspace-btn"
          onClick={() => setShowDialog(true)}
        >
          <Plus size={15} />
          New Workspace
        </button>
      </div>

      <div className="sidebar-section">
        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => setShowSearch(true)}>
            <Search size={15} />
            Search Chats
          </button>
          <button className="nav-item">
            <HelpCircle size={15} />
            Help & Docs
          </button>
        </nav>
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section workspaces-section">
        <button
          className="workspaces-toggle"
          onClick={() => setShowWorkspaces(!showWorkspaces)}
        >
          <span>Your Workspaces</span>
          {showWorkspaces ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )}
        </button>

        {showWorkspaces && (
          <div className="workspace-list">
            {loadingWorkspaces && <p className="ws-empty">Loading…</p>}
            {!loadingWorkspaces && workspaces.length === 0 && (
              <p className="ws-empty">No workspaces yet</p>
            )}

            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className={`workspace-item ${activeWorkspace?.id === ws.id ? "active" : ""}`}
                onMouseEnter={() => setHoveredWs(ws.id)}
                onMouseLeave={() => setHoveredWs(null)}
                onClick={() => setActiveWorkspace(ws)}
                title={`${ws.name} · ${ws.client_id}`}
              >
                <div className="ws-dot" />
                <div className="ws-info">
                  <span className="ws-name">{ws.name}</span>
                  <span className="ws-meta">
                    {ws.client_id} · {ws.doc_count} doc
                    {ws.doc_count !== 1 ? "s" : ""}
                  </span>
                </div>
                {(hoveredWs === ws.id || deletingWs === ws.id) && (
                  <button
                    className="ws-delete-btn"
                    onClick={(e) => handleDelete(e, ws)}
                    disabled={deletingWs === ws.id}
                    title="Delete workspace"
                  >
                    {deletingWs === ws.id ? (
                      <span className="ws-deleting-dot" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-user" onClick={onLogout} title="Sign out">
        <div className="user-avatar">{user?.avatar}</div>
        <div className="user-info">
          <div className="user-name">{user?.name}</div>
          <div className="user-email">{user?.email}</div>
        </div>
        <LogOut size={14} className="logout-icon" />
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Fraunces:wght@300&display=swap');

  .sidebar { width:240px; min-width:240px; background:#1a1a18; display:flex; flex-direction:column; height:100vh; font-family:'DM Sans',sans-serif; }
  .sidebar-collapsed { width:56px; min-width:56px; background:#1a1a18; display:flex; flex-direction:column; align-items:center; padding:16px 0; gap:8px; height:100vh; }
  .collapsed-actions { display:flex; flex-direction:column; gap:4px; margin-top:8px; }
  .collapsed-avatar { margin-top:auto; margin-bottom:16px; width:32px; height:32px; border-radius:50%; background:#c8a96e; color:#1a1a18; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; cursor:pointer; }

  .sidebar-top { display:flex; align-items:center; justify-content:space-between; padding:18px 16px 16px; flex-shrink:0; }
  .sidebar-brand { display:flex; align-items:center; gap:8px; }
  .brand-hex { color:#c8a96e; font-size:18px; }
  .brand-text { font-family:'Fraunces',serif; font-size:15px; font-weight:300; color:#faf9f7; letter-spacing:.03em; }

  .icon-btn { background:none; border:none; color:#6a6a68; cursor:pointer; padding:6px; border-radius:6px; display:flex; align-items:center; transition:color .15s,background .15s; }
  .icon-btn:hover { color:#faf9f7; background:#2e2e2c; }

  .sidebar-section { padding:8px 12px; }
  .workspaces-section { flex:1; overflow-y:auto; }

  .new-workspace-btn { width:100%; display:flex; align-items:center; gap:8px; padding:9px 12px; background:#c8a96e; color:#1a1a18; border:none; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; cursor:pointer; transition:background .15s; }
  .new-workspace-btn:hover { background:#d4b87a; }

  .sidebar-nav { display:flex; flex-direction:column; gap:2px; margin-top:4px; }
  .nav-item { width:100%; display:flex; align-items:center; gap:9px; padding:8px 10px; background:none; border:none; color:#8a8a82; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:300; cursor:pointer; border-radius:7px; text-align:left; transition:color .15s,background .15s; }
  .nav-item:hover { color:#faf9f7; background:#2a2a28; }

  .sidebar-divider { height:1px; background:#2a2a28; margin:4px 16px; flex-shrink:0; }

  .workspaces-toggle { width:100%; display:flex; align-items:center; justify-content:space-between; background:none; border:none; color:#6a6a68; font-family:'DM Sans',sans-serif; font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.08em; cursor:pointer; padding:6px 10px; transition:color .15s; }
  .workspaces-toggle:hover { color:#faf9f7; }

  .workspace-list { display:flex; flex-direction:column; gap:1px; margin-top:6px; }
  .workspace-item { width:100%; display:flex; align-items:center; gap:10px; padding:7px 8px 7px 10px; background:none; border-radius:7px; color:#8a8a82; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:300; cursor:pointer; transition:color .15s,background .15s; user-select:none; }
  .workspace-item:hover { color:#faf9f7; background:#2a2a28; }
  .workspace-item.active { color:#faf9f7; background:#2a2a28; }
  .ws-dot { width:5px; height:5px; border-radius:50%; background:#4a4a48; flex-shrink:0; }
  .workspace-item.active .ws-dot { background:#c8a96e; }
  .ws-info { display:flex; flex-direction:column; overflow:hidden; flex:1; }
  .ws-name { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ws-meta { font-size:10px; color:#6a6a68; font-weight:300; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
  .workspace-item.active .ws-meta { color:#8a8a82; }
  .ws-delete-btn { background:none; border:none; color:#6a6a68; cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:color .15s,background .15s; }
  .ws-delete-btn:hover:not(:disabled) { color:#ef4444; background:#3a2020; }
  .ws-delete-btn:disabled { opacity:.5; cursor:default; }
  .ws-deleting-dot { width:8px; height:8px; border-radius:50%; border:1.5px solid #6a6a68; border-top-color:transparent; animation:spin .6s linear infinite; display:inline-block; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .ws-empty { font-size:12px; color:#4a4a48; padding:8px 10px; font-weight:300; margin:0; }

  .sidebar-user { display:flex; align-items:center; gap:10px; padding:14px 16px; border-top:1px solid #2a2a28; cursor:pointer; transition:background .15s; flex-shrink:0; }
  .sidebar-user:hover { background:#2a2a28; }
  .sidebar-user:hover .logout-icon { opacity:1; }
  .user-avatar { width:30px; height:30px; border-radius:50%; background:#c8a96e; color:#1a1a18; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; flex-shrink:0; }
  .user-info { flex:1; overflow:hidden; }
  .user-name { font-size:12px; font-weight:500; color:#faf9f7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-transform:capitalize; }
  .user-email { font-size:11px; color:#6a6a68; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:300; }
  .logout-icon { color:#6a6a68; opacity:0; transition:opacity .15s; flex-shrink:0; }

  /* ── Search panel ── */
  .search-panel { display:flex; flex-direction:column; height:100vh; }

  .search-input-row { display:flex; align-items:center; gap:8px; padding:14px 12px 10px; border-bottom:1px solid #2a2a28; flex-shrink:0; }
  .search-back-btn { background:none; border:none; color:#6a6a68; cursor:pointer; padding:6px; border-radius:6px; display:flex; align-items:center; flex-shrink:0; transition:color .15s,background .15s; }
  .search-back-btn:hover { color:#faf9f7; background:#2e2e2c; }

  .search-input-wrap { flex:1; display:flex; align-items:center; gap:6px; background:#2a2a28; border-radius:8px; padding:6px 10px; }
  .search-icon-inner { color:#6a6a68; flex-shrink:0; }
  .search-input { flex:1; background:none; border:none; outline:none; color:#faf9f7; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:300; }
  .search-input::placeholder { color:#4a4a48; }
  .search-clear { background:none; border:none; color:#6a6a68; cursor:pointer; display:flex; align-items:center; padding:0; flex-shrink:0; }
  .search-clear:hover { color:#faf9f7; }

  .search-results { flex:1; overflow-y:auto; padding:8px 0; }
  .search-status { font-size:12px; color:#4a4a48; padding:16px 14px; font-weight:300; text-align:center; margin:0; }

  .search-result-item { width:100%; background:none; border:none; border-bottom:1px solid #222220; padding:10px 14px; cursor:pointer; text-align:left; font-family:'DM Sans',sans-serif; transition:background .15s; display:flex; flex-direction:column; gap:4px; }
  .search-result-item:hover { background:#2a2a28; }
  .search-result-item:last-child { border-bottom:none; }

  .sr-workspace { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:500; color:#c8a96e; text-transform:uppercase; letter-spacing:.06em; margin-bottom:2px; }
  .sr-ws-dot { width:4px; height:4px; border-radius:50%; background:#c8a96e; flex-shrink:0; }
  .sr-client-id { color:#5a5a58; font-weight:300; text-transform:none; letter-spacing:0; }

  .sr-query { font-size:12px; color:#faf9f7; font-weight:400; margin:0; line-height:1.5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sr-response { font-size:11px; color:#6a6a68; font-weight:300; margin:0; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .sr-date { font-size:10px; color:#4a4a48; margin-top:2px; }
`;

export default Sidebar;
