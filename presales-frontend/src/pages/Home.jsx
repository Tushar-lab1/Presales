import { useState, useEffect } from "react";
import Hero from "../components/Hero";
import Sidebar from "../components/Sidebar";
import NewWorkspaceDialog from "../components/NewWorkspaceDialog";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function Home({ user, onLogout }) {
  const [showDialog, setShowDialog] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  useEffect(() => {
    fetchWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchWorkspaces = async () => {
    setLoadingWorkspaces(true);
    try {
      const resp = await fetch(
        `${API}/workspaces?email=${encodeURIComponent(user.email)}`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      const data = await resp.json();
      const list = data.workspaces || [];
      setWorkspaces(list);
      // auto-select first workspace on load
      if (list.length && !activeWorkspace) setActiveWorkspace(list[0]);
    } catch (e) {
      console.error("Failed to load workspaces", e);
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const handleAddWorkspace = async ({ clientId, clientName }) => {
    try {
      const resp = await fetch(`${API}/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          email: user.email,
          client_id: clientId,
          name: clientName,
        }),
      });
      const data = await resp.json();
      const newWs = data.workspace;
      setWorkspaces((prev) => [newWs, ...prev]);
      setActiveWorkspace(newWs);
      setShowDialog(false);
    } catch (e) {
      console.error("Failed to create workspace", e);
    }
  };

  const handleDeleteWorkspace = async (workspaceId) => {
    try {
      await fetch(
        `${API}/workspaces/${workspaceId}?email=${encodeURIComponent(user.email)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.token}` },
        },
      );
      const remaining = workspaces.filter((w) => w.id !== workspaceId);
      setWorkspaces(remaining);
      // if the deleted one was active, switch to the next available
      if (activeWorkspace?.id === workspaceId) {
        setActiveWorkspace(remaining.length ? remaining[0] : null);
      }
    } catch (e) {
      console.error("Failed to delete workspace", e);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "#faf9f7" }}>
      <Sidebar
        showDialog={showDialog}
        setShowDialog={setShowDialog}
        user={user}
        onLogout={onLogout}
        workspaces={workspaces}
        loadingWorkspaces={loadingWorkspaces}
        activeWorkspace={activeWorkspace}
        setActiveWorkspace={setActiveWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
      />

      <Hero user={user} workspace={activeWorkspace} blurred={showDialog} />

      {showDialog && (
        <NewWorkspaceDialog
          onAdd={handleAddWorkspace}
          onClose={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}

export default Home;
