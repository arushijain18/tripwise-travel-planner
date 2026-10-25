import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewTrip from "./pages/NewTrip";
import TripView from "./pages/TripView";

function Protected({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  return session ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/shared/:id" element={<TripView shared />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/new" element={<Protected><NewTrip /></Protected>} />
          <Route path="/trips/:id" element={<Protected><TripView /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
