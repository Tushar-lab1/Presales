import { useState } from "react";
import Login, { kc } from "./pages/Login";
import Home from "./pages/Home";

function App() {
  const [user, setUser] = useState(null);

  const handleLogin = (userObj) => setUser(userObj);

  const handleLogout = () => {
    setUser(null);
    kc.logout({ redirectUri: window.location.origin });
  };

  if (!user) return <Login onLogin={handleLogin}/>;
  return <Home user={user} onLogout={handleLogout}/>;
}

export default App;
