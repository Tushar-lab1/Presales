import { useState, useRef, useEffect } from "react";
import {
  Paperclip,
  Send,
  X,
  Bot,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  Trash2,
  Upload,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(b) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type) {
  const icons = {
    pdf: "📄",
    docx: "📝",
    txt: "📃",
    csv: "📊",
    xlsx: "📊",
    xls: "📊",
    pptx: "📑",
  };
  return icons[type] || "📁";
}

// ── Citation card ─────────────────────────────────────────────────────────────

function CitationCard({ citation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="citation-card">
      <button className="citation-header" onClick={() => setOpen(!open)}>
        <span className="citation-rank">[{citation.rank}]</span>
        <span className="citation-filename">
          {fileIcon(citation.file_type)} {citation.filename}
        </span>
        {citation.page_number && (
          <span className="citation-page">p.{citation.page_number}</span>
        )}
        {citation.score != null && (
          <span className="citation-score">
            {(citation.score * 100).toFixed(0)}% match
          </span>
        )}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="citation-body">
          <p className="citation-meta">
            {citation.uploaded_at && (
              <>
                Uploaded {new Date(citation.uploaded_at).toLocaleDateString()}{" "}
                ·{" "}
              </>
            )}
            Type: {citation.file_type?.toUpperCase()}
            {citation.page_number ? ` · Page ${citation.page_number}` : ""}
          </p>
          <p className="citation-content">{citation.content}</p>
        </div>
      )}
    </div>
  );
}

// ── Document panel ────────────────────────────────────────────────────────────

function DocumentPanel({ workspace, user, docs, loadingDocs, refreshDocs }) {
  const handleDelete = async (docId) => {
    if (!confirm("Delete this document and all its chunks?")) return;
    await fetch(
      `${API}/workspaces/${workspace.id}/documents/${docId}?email=${encodeURIComponent(user.email)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${user.token}` } },
    );
    refreshDocs();
  };

  return (
    <div className="doc-panel">
      <p className="doc-panel-title">Documents in this workspace</p>
      {loadingDocs && <p className="doc-empty">Loading…</p>}
      {!loadingDocs && docs.length === 0 && (
        <p className="doc-empty">No documents yet. Upload files below.</p>
      )}
      {docs.map((d) => (
        <div key={d.id} className="doc-row">
          <span className="doc-icon">{fileIcon(d.file_type)}</span>
          <div className="doc-info">
            <span className="doc-name" title={d.filename}>
              {d.filename}
            </span>
            <span className="doc-meta">
              {formatBytes(d.file_size)}
              {d.page_count ? ` · ${d.page_count} pages` : ""}
              {` · ${d.chunk_count} chunks`}
            </span>
          </div>
          <button
            className="doc-delete"
            onClick={() => handleDelete(d.id)}
            title="Delete document"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Hero ─────────────────────────────────────────────────────────────────

function Hero({ user, workspace, blurred }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const bottomRef = useRef(null);

  // ── On workspace change: load history then documents ─────────────────────
  useEffect(() => {
    if (!workspace) return;
    setInput("");
    setFiles([]);
    setShowDocs(false);
    loadChatHistory();
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Load chat history from backend ────────────────────────────────────────
  const loadChatHistory = async () => {
    setLoadingChat(true);
    setMessages([]); // clear while loading
    try {
      const resp = await fetch(
        `${API}/chat/history?workspace_id=${workspace.id}&email=${encodeURIComponent(user.email)}`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      const data = await resp.json();
      const history = data.history || [];

      if (history.length === 0) {
        // Fresh workspace — show welcome
        setMessages([
          {
            role: "assistant",
            content: `Workspace **${workspace.name}** is ready. Upload documents or ask a question.`,
          },
        ]);
      } else {
        // Rebuild message list from saved turns
        const msgs = [];
        for (const turn of history) {
          msgs.push({ role: "user", content: turn.user_query });
          msgs.push({
            role: "assistant",
            content: turn.model_response,
            citations: turn.citations || [],
            timestamp: turn.created_at,
          });
        }
        setMessages(msgs);
      }
    } catch (e) {
      console.error("Failed to load chat history", e);
      setMessages([
        {
          role: "assistant",
          content: `Workspace **${workspace.name}** is ready. Upload documents or ask a question.`,
        },
      ]);
    } finally {
      setLoadingChat(false);
    }
  };

  // ── Load document list ────────────────────────────────────────────────────
  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const resp = await fetch(
        `${API}/workspaces/${workspace.id}/documents?email=${encodeURIComponent(user.email)}`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      const data = await resp.json();
      setDocs(data.documents || []);
    } catch (e) {
      console.error("Failed to load documents", e);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleFileSelect = (e) => {
    setFiles((prev) => [...prev, ...Array.from(e.target.files)]);
    e.target.value = ""; // allow re-selecting same file
  };

  const removeFile = (i) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // ── Upload files ──────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!files.length || !workspace) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("workspace_id", workspace.id);
    fd.append("email", user.email);
    files.forEach((f) => fd.append("files", f));

    try {
      const resp = await fetch(`${API}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: fd,
      });
      const data = await resp.json();
      const summary = (data.ingested || [])
        .map(
          (d) =>
            `• ${d.filename} — ${d.chunk_count} chunks${d.page_count ? `, ${d.page_count} pages` : ""}`,
        )
        .join("\n");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Uploaded ${data.ingested?.length} file(s):\n${summary}`,
        },
      ]);
      setFiles([]);
      loadDocuments();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Upload failed. Please try again.",
          error: true,
        },
      ]);
    }
    setUploading(false);
  };

  // ── Send chat message ─────────────────────────────────────────────────────
  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !workspace) return;

    const userMsg = input.trim();
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    try {
      const fd = new FormData();
      fd.append("message", userMsg);
      fd.append("workspace_id", workspace.id);
      fd.append("email", user.email);

      const resp = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: fd,
      });
      const data = await resp.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          citations: data.citations || [],
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't reach the server. Please try again.",
          error: true,
        },
      ]);
    }
    setLoading(false);
  };

  // ── Empty state (no workspace selected) ──────────────────────────────────
  if (!workspace) {
    return (
      <div
        className={`hero-root ${blurred ? "blurred" : ""}`}
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <div className="empty-state">
          <div className="empty-icon">⬡</div>
          <h2>No workspace selected</h2>
          <p>
            Create a new workspace or select one from the sidebar to get
            started.
          </p>
        </div>
        <style>{heroCSS}</style>
      </div>
    );
  }

  return (
    <div className={`hero-root ${blurred ? "blurred" : ""}`}>
      {/* Header */}
      <div className="hero-header">
        <div className="hero-header-left">
          <div className="header-status-dot" />
          <div>
            <span className="header-title">{workspace.name}</span>
            <span className="header-sub">{workspace.client_id}</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="header-docs-btn"
            onClick={() => {
              setShowDocs(!showDocs);
              if (!showDocs) loadDocuments();
            }}
          >
            <FileText size={14} />
            {docs.length} doc{docs.length !== 1 ? "s" : ""}
          </button>
          {user && <div className="header-avatar">{user.avatar}</div>}
        </div>
      </div>

      {/* Document panel */}
      {showDocs && (
        <DocumentPanel
          workspace={workspace}
          user={user}
          docs={docs}
          loadingDocs={loadingDocs}
          refreshDocs={loadDocuments}
        />
      )}

      {/* Messages */}
      <div className="messages-area">
        {loadingChat ? (
          <div className="history-loading">
            <span className="history-spinner" />
            Loading conversation history…
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message-row ${msg.role}`}>
              <div className={`message-icon ${msg.role}`}>
                {msg.role === "assistant" ? (
                  <Bot size={14} />
                ) : (
                  <User size={14} />
                )}
              </div>
              <div className="message-col">
                {msg.timestamp && (
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                )}
                <div
                  className={`message-bubble ${msg.role} ${msg.error ? "error" : ""}`}
                >
                  {msg.content}
                </div>
                {msg.citations?.length > 0 && (
                  <div className="citations-area">
                    <p className="citations-label">Sources</p>
                    {msg.citations.map((cit, ci) => (
                      <CitationCard key={`${i}-${ci}`} citation={cit} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {(loading || uploading) && (
          <div className="message-row assistant">
            <div className="message-icon assistant">
              <Bot size={14} />
            </div>
            <div className="message-bubble assistant typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* File chips + upload button */}
      {files.length > 0 && (
        <div className="file-chips-area">
          {files.map((file, i) => (
            <div key={i} className="file-chip">
              <span>📄</span>
              <span className="file-name">{file.name}</span>
              <button className="file-remove" onClick={() => removeFile(i)}>
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="upload-now-btn"
            onClick={handleUpload}
            disabled={uploading}
          >
            <Upload size={13} />
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="input-area">
        <div className={`input-box ${loading || uploading ? "disabled" : ""}`}>
          <label className="attach-btn" title="Attach files">
            <Paperclip size={16} />
            <input
              type="file"
              multiple
              className="hidden-input"
              onChange={handleFileSelect}
              disabled={loading || uploading}
            />
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about this workspace…"
            className="chat-input"
            disabled={loading || uploading || loadingChat}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) sendMessage(e);
            }}
          />
          <button
            className={`send-btn ${input.trim() ? "active" : ""}`}
            onClick={sendMessage}
            disabled={!input.trim() || loading || uploading || loadingChat}
          >
            <Send size={15} />
          </button>
        </div>
        <p className="input-hint">
          Enter to send · 📎 to attach files for upload
        </p>
      </div>

      <style>{heroCSS}</style>
    </div>
  );
}

const heroCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Fraunces:wght@300&display=swap');
  .hero-root { flex:1; display:flex; flex-direction:column; height:100vh; background:#faf9f7; font-family:'DM Sans',sans-serif; transition:opacity .2s; overflow:hidden; }
  .hero-root.blurred { opacity:.15; pointer-events:none; }

  /* empty state */
  .empty-state { text-align:center; padding:48px 32px; }
  .empty-icon { font-size:48px; color:#c8a96e; margin-bottom:16px; }
  .empty-state h2 { font-family:'Fraunces',serif; font-size:22px; font-weight:300; color:#1a1a18; margin:0 0 8px; }
  .empty-state p  { font-size:17px; color:#999999; font-weight:300; }

  /* header */
  .hero-header { display:flex; align-items:center; justify-content:space-between; padding:14px 24px; border-bottom:1px solid #eae8e4; background:#faf9f7; flex-shrink:0; }
  .hero-header-left { display:flex; align-items:center; gap:10px; }
  .header-status-dot { width:7px; height:7px; border-radius:50%; background:#4ade80; box-shadow:0 0 0 2px #4ade8030; flex-shrink:0; }
  .header-title { font-family:'Fraunces',serif; font-size:15px; font-weight:300; color:#1a1a18; display:block; }
  .header-sub   { font-size:11px; color:#8a8a82; font-weight:300; }
  .header-actions { display:flex; align-items:center; gap:10px; }
  .header-docs-btn { display:flex; align-items:center; gap:6px; padding:6px 12px; background:#f0ede8; border:none; border-radius:7px; font-family:'DM Sans',sans-serif; font-size:12px; color:#5a5a58; cursor:pointer; transition:background .15s; }
  .header-docs-btn:hover { background:#e0ddd8; }
  .header-avatar { width:30px; height:30px; border-radius:50%; background:#1a1a18; color:#faf9f7; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; }

  /* document panel */
  .doc-panel { border-bottom:1px solid #eae8e4; padding:12px 24px; background:#fefefe; max-height:200px; overflow-y:auto; flex-shrink:0; }
  .doc-panel-title { font-size:11px; font-weight:500; color:#5a5a58; text-transform:uppercase; letter-spacing:.07em; margin:0 0 8px; }
  .doc-empty { font-size:12px; color:#8a8a82; font-weight:300; margin:4px 0; }
  .doc-row { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #f0ede8; }
  .doc-row:last-child { border-bottom:none; }
  .doc-icon { font-size:16px; flex-shrink:0; }
  .doc-info { flex:1; overflow:hidden; }
  .doc-name { display:block; font-size:13px; color:#1a1a18; font-weight:300; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .doc-meta { display:block; font-size:11px; color:#8a8a82; font-weight:300; margin-top:1px; }
  .doc-delete { background:none; border:none; color:#c0bdb8; cursor:pointer; padding:4px; border-radius:4px; display:flex; align-items:center; transition:color .15s,background .15s; flex-shrink:0; }
  .doc-delete:hover { color:#dc2626; background:#fff0f0; }

  /* history loading */
  .history-loading { display:flex; align-items:center; gap:10px; color:#8a8a82; font-size:13px; font-weight:300; padding:32px 0; justify-content:center; }
  .history-spinner { width:16px; height:16px; border:2px solid #e0ddd8; border-top-color:#c8a96e; border-radius:50%; animation:spin .7s linear infinite; flex-shrink:0; }
  @keyframes spin { to { transform:rotate(360deg); } }

  /* messages */
  .messages-area { flex:1; overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:20px; }
  .message-row { display:flex; gap:12px; align-items:flex-start; max-width:85%; animation:fadeUp .25s ease; }
  .message-row.user { flex-direction:row-reverse; align-self:flex-end; }
  .message-col { display:flex; flex-direction:column; gap:6px; flex:1; min-width:0; }
  @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

  .message-time { font-size:10px; color:#c0bdb8; font-weight:300; }
  .message-row.user .message-time { text-align:right; }

  .message-icon { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; }
  .message-icon.assistant { background:#1a1a18; color:#c8a96e; }
  .message-icon.user      { background:#eae8e4; color:#5a5a58; }

  .message-bubble { padding:12px 16px; border-radius:14px; font-size:14px; line-height:1.65; font-weight:300; white-space:pre-wrap; word-break:break-word; }
  .message-bubble.assistant { background:white; color:#1a1a18; border:1px solid #eae8e4; border-radius:2px 14px 14px 14px; }
  .message-bubble.user      { background:#1a1a18; color:#faf9f7; border-radius:14px 14px 2px 14px; }
  .message-bubble.error     { background:#fff3f3; border-color:#fca5a5; color:#dc2626; }

  /* typing */
  .message-bubble.typing { display:flex; gap:4px; align-items:center; padding:14px 18px; }
  .typing-dot { width:6px; height:6px; border-radius:50%; background:#c8a96e; animation:typingBounce 1.2s infinite; }
  .typing-dot:nth-child(2) { animation-delay:.2s; }
  .typing-dot:nth-child(3) { animation-delay:.4s; }
  @keyframes typingBounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-5px);opacity:1} }

  /* citations */
  .citations-area { display:flex; flex-direction:column; gap:4px; }
  .citations-label { font-size:10px; font-weight:500; color:#8a8a82; text-transform:uppercase; letter-spacing:.07em; margin:0 0 2px; }
  .citation-card { background:#f8f6f2; border:1px solid #e8e5e0; border-radius:8px; overflow:hidden; }
  .citation-header { width:100%; display:flex; align-items:center; gap:8px; padding:8px 12px; background:none; border:none; cursor:pointer; text-align:left; font-family:'DM Sans',sans-serif; font-size:12px; color:#3a3a38; }
  .citation-header:hover { background:#f0ede8; }
  .citation-rank { font-weight:600; color:#c8a96e; flex-shrink:0; }
  .citation-filename { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .citation-page  { font-size:10px; color:#8a8a82; flex-shrink:0; }
  .citation-score { font-size:10px; color:#8a8a82; flex-shrink:0; background:#eae8e4; padding:2px 6px; border-radius:10px; }
  .citation-body  { padding:10px 12px; border-top:1px solid #e8e5e0; }
  .citation-meta  { font-size:10px; color:#8a8a82; margin:0 0 6px; }
  .citation-content { font-size:12px; color:#3a3a38; line-height:1.6; margin:0; white-space:pre-wrap; word-break:break-word; }

  /* file chips */
  .file-chips-area { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:8px 24px 0; flex-shrink:0; }
  .file-chip { display:flex; align-items:center; gap:6px; background:#f0ede8; border:1px solid #e0ddd8; border-radius:20px; padding:5px 10px; font-size:12px; color:#3a3a38; max-width:200px; }
  .file-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:300; }
  .file-remove { background:none; border:none; cursor:pointer; color:#8a8a82; display:flex; align-items:center; padding:0; }
  .file-remove:hover { color:#1a1a18; }
  .upload-now-btn { display:flex; align-items:center; gap:6px; padding:5px 14px; background:#1a1a18; color:#faf9f7; border:none; border-radius:20px; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:500; cursor:pointer; transition:background .15s; }
  .upload-now-btn:hover:not(:disabled) { background:#c8a96e; color:#1a1a18; }
  .upload-now-btn:disabled { opacity:.6; cursor:default; }

  /* input */
  .input-area { padding:14px 24px 18px; flex-shrink:0; }
  .input-box { display:flex; align-items:center; gap:4px; background:white; border:1px solid #e0ddd8; border-radius:14px; padding:6px 8px; transition:border-color .2s,box-shadow .2s; box-shadow:0 2px 8px rgba(0,0,0,.04); }
  .input-box:focus-within { border-color:#c8a96e; box-shadow:0 0 0 3px #c8a96e15,0 2px 8px rgba(0,0,0,.04); }
  .input-box.disabled { opacity:.6; }
  .attach-btn { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:9px; color:#8a8a82; cursor:pointer; transition:background .15s,color .15s; }
  .attach-btn:hover { background:#f0ede8; color:#1a1a18; }
  .hidden-input { display:none; }
  .chat-input { flex:1; border:none; outline:none; background:transparent; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:300; color:#1a1a18; padding:8px 4px; }
  .chat-input::placeholder { color:#b8b5b0; }
  .send-btn { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:9px; border:none; background:#e0ddd8; color:#8a8a82; cursor:not-allowed; transition:background .15s,color .15s; flex-shrink:0; }
  .send-btn.active { background:#1a1a18; color:#faf9f7; cursor:pointer; }
  .send-btn.active:hover { background:#c8a96e; }
  .input-hint { font-size:11px; color:#c0bdb8; text-align:center; margin-top:8px; font-weight:300; }
`;

export default Hero;
