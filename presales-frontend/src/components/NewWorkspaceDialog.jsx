import { useState } from "react";
import { X, Folder } from "lucide-react";

function NewWorkspaceDialog({ onAdd, onClose }) {
  const [clientId,   setClientId]   = useState("");
  const [clientName, setClientName] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientId.trim() || !clientName.trim()) {
      setError("Both fields are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onAdd({ clientId: clientId.trim(), clientName: clientName.trim() });
    } catch {
      setError("Failed to create workspace. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-card">
        <div className="dialog-header">
          <div className="dialog-icon"><Folder size={18}/></div>
          <div>
            <h2 className="dialog-title">New Workspace</h2>
            <p className="dialog-subtitle">Create a workspace for a new client</p>
          </div>
          <button className="dialog-close" onClick={onClose}><X size={16}/></button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label>Client ID</label>
            <input
              placeholder="e.g. ACME-001"
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setError(""); }}
              disabled={loading}
            />
          </div>
          <div className="field-group">
            <label>Client Name</label>
            <input
              placeholder="e.g. Acme Corporation"
              value={clientName}
              onChange={(e) => { setClientName(e.target.value); setError(""); }}
              disabled={loading}
            />
          </div>

          {error && <p className="dialog-error">{error}</p>}

          <div className="dialog-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? <span className="spinner"/> : "Create Workspace"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Fraunces:wght@300&display=swap');
        .dialog-overlay { position:fixed; inset:0; background:rgba(26,26,24,.55); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:50; animation:fadeIn .15s ease; }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .dialog-card { background:#faf9f7; border-radius:16px; width:100%; max-width:420px; box-shadow:0 24px 60px rgba(0,0,0,.2); animation:slideUp .2s ease; font-family:'DM Sans',sans-serif; }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .dialog-header { display:flex; align-items:flex-start; gap:14px; padding:24px 24px 20px; border-bottom:1px solid #eae8e4; }
        .dialog-icon { width:38px; height:38px; background:#1a1a18; color:#c8a96e; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .dialog-title { font-family:'Fraunces',serif; font-size:18px; font-weight:300; color:#1a1a18; margin:0 0 2px; }
        .dialog-subtitle { font-size:13px; color:#8a8a82; font-weight:300; margin:0; }
        .dialog-close { margin-left:auto; background:none; border:none; color:#8a8a82; cursor:pointer; padding:4px; border-radius:6px; display:flex; align-items:center; transition:color .15s,background .15s; }
        .dialog-close:hover { color:#1a1a18; background:#f0ede8; }
        .dialog-form { padding:24px; display:flex; flex-direction:column; gap:16px; }
        .field-group { display:flex; flex-direction:column; gap:6px; }
        .field-group label { font-size:11px; font-weight:500; color:#5a5a58; text-transform:uppercase; letter-spacing:.07em; }
        .field-group input { padding:11px 14px; border:1px solid #e0ddd8; border-radius:9px; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:300; color:#1a1a18; background:white; outline:none; transition:border-color .2s,box-shadow .2s; }
        .field-group input:focus { border-color:#c8a96e; box-shadow:0 0 0 3px #c8a96e18; }
        .field-group input::placeholder { color:#c0bdb8; }
        .field-group input:disabled { opacity:.6; }
        .dialog-error { font-size:12px; color:#dc2626; margin:0; }
        .dialog-actions { display:flex; gap:10px; margin-top:4px; }
        .btn-cancel { flex:1; padding:11px; background:#f0ede8; color:#5a5a58; border:none; border-radius:9px; font-family:'DM Sans',sans-serif; font-size:13px; cursor:pointer; transition:background .15s; }
        .btn-cancel:hover:not(:disabled) { background:#e0ddd8; }
        .btn-submit { flex:1; padding:11px; background:#1a1a18; color:#faf9f7; border:none; border-radius:9px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; cursor:pointer; transition:background .15s; display:flex; align-items:center; justify-content:center; min-height:40px; }
        .btn-submit:hover:not(:disabled) { background:#c8a96e; color:#1a1a18; }
        .btn-submit:disabled { opacity:.6; }
        .spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default NewWorkspaceDialog;
