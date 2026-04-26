import { useEffect, useState } from "react";
import Keycloak from "keycloak-js";

// Initialise Keycloak once (module-level singleton)
const kc = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080",
  realm: import.meta.env.VITE_KEYCLOAK_REALM || "presales",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT || "presales-app",
});

export { kc }; // exported so other components can call kc.logout()

function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If Keycloak already has a valid session in this tab, auto-login
  useEffect(() => {
    kc.init({
      onLoad: "check-sso",
      silentCheckSsoRedirectUri:
        window.location.origin + "/silent-check-sso.html",
    })
      .then((authenticated) => {
        if (authenticated) finishLogin();
      })
      .catch(() => {}); // silent – user just hasn't logged in yet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishLogin = async () => {
    setLoading(true);
    try {
      // Verify token with our backend and get the DB user object
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/auth/me`,
        {
          headers: { Authorization: `Bearer ${kc.token}` },
        },
      );
      console.log("TOKEN:", kc.token);
      if (!resp.ok) throw new Error("Backend rejected token");
      const { user } = await resp.json();
      onLogin({
        ...user,
        avatar: (user.name || user.email || "?")[0].toUpperCase(),
        token: kc.token,
      });
    } catch (e) {
      setError("Authentication failed. Please try again.");
      setLoading(false);
    }
  };

  const handleSSO = () => {
    setLoading(true);
    kc.login()
      .then(finishLogin)
      .catch(() => {
        setError("Could not reach the identity provider.");
        setLoading(false);
      });
  };

  return (
    <div className="login-root">
      <div className="login-left">
        <div className="login-brand">
          <div className="brand-icon">⬡</div>
          <span className="brand-name">Presales AI</span>
        </div>
        <div className="login-tagline">
          <h1>
            Intelligence
            <br />
            for every
            <br />
            <em>deal.</em>
          </h1>
          <p>
            Your AI-powered assistant for smarter presales workflows,
            context-aware client insights, and seamless collaboration.
          </p>
        </div>
        <div className="login-dots">
          <div className="dot" />
          <div className="dot" />
          <div className="dot" />
        </div>
      </div>

      <div className="login-right">
        <div className="login-card">
          <div className="login-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your workspace</p>
          </div>

          <div className="sso-section">
            <p className="sso-hint">
              Sign in using your organisation's identity provider. No password
              needed.
            </p>
            {error && <p className="sso-error">{error}</p>}
            <button
              className={`sso-btn ${loading ? "loading" : ""}`}
              onClick={handleSSO}
              disabled={loading}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M8 12h8M12 8v8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  Continue with SSO
                </>
              )}
            </button>
          </div>

          <p className="login-footer">
            Don't have an account? <a href="#">Contact your admin</a>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;1,300&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .login-root { display:flex; min-height:100vh; background:#faf9f7; font-family:'DM Sans',sans-serif; }

        .login-left {
          width:45%; background:#1a1a18; padding:48px;
          display:flex; flex-direction:column; justify-content:space-between;
          position:relative; overflow:hidden;
        }
        .login-left::before {
          content:''; position:absolute; top:-80px; right:-80px;
          width:320px; height:320px; border-radius:50%;
          background:radial-gradient(circle,#c8a96e22 0%,transparent 70%);
        }
        .login-brand { display:flex; align-items:center; gap:10px; color:#faf9f7; }
        .brand-icon  { font-size:22px; color:#c8a96e; }
        .brand-name  { font-family:'Fraunces',serif; font-size:18px; font-weight:300; letter-spacing:.04em; }
        .login-tagline h1 { font-family:'Fraunces',serif; font-size:56px; font-weight:300; line-height:1.1; color:#faf9f7; margin:0 0 24px; }
        .login-tagline h1 em { font-style:italic; color:#c8a96e; }
        .login-tagline p { color:#8a8a82; font-size:15px; line-height:1.7; max-width:320px; font-weight:300; }
        .login-dots { display:flex; gap:6px; }
        .dot { width:6px; height:6px; border-radius:50%; background:#3a3a38; }

        .login-right { flex:1; display:flex; align-items:center; justify-content:center; padding:48px; }
        .login-card  { width:100%; max-width:400px; }
        .login-card-header { margin-bottom:32px; }
        .login-card-header h2 { font-family:'Fraunces',serif; font-size:32px; font-weight:300; color:#1a1a18; margin:0 0 6px; }
        .login-card-header p  { color:#8a8a82; font-size:14px; font-weight:300; }

        .sso-section { display:flex; flex-direction:column; gap:16px; }
        .sso-hint    { font-size:13px; color:#8a8a82; font-weight:300; line-height:1.6; }
        .sso-error   { font-size:13px; color:#dc2626; font-weight:300; }

        .sso-btn {
          width:100%; padding:14px; background:#1a1a18; color:#faf9f7; border:none;
          border-radius:10px; font-family:'DM Sans',sans-serif; font-size:14px;
          cursor:pointer; display:flex; align-items:center; justify-content:center;
          gap:10px; transition:background .2s; min-height:50px;
        }
        .sso-btn:hover:not(:disabled) { background:#2e2e2c; }
        .sso-btn.loading { opacity:.7; }

        .login-footer { margin-top:32px; font-size:13px; color:#8a8a82; text-align:center; font-weight:300; }
        .login-footer a { color:#1a1a18; text-decoration:underline; text-decoration-color:#c8a96e; }

        .spinner {
          width:18px; height:18px; border:2px solid rgba(255,255,255,.3);
          border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; display:inline-block;
        }
        @keyframes spin { to { transform:rotate(360deg); } }
        @media (max-width:768px) { .login-left { display:none; } .login-right { padding:24px; } }
      `}</style>
    </div>
  );
}

export default Login;
