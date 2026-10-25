import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { supabase } from "../supabaseClient";

export default function Navbar() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <header className="navbar no-print">
      <Link to="/" className="brand">✈️ TripWise</Link>
      {session ? (
        <nav>
          <Link to="/">My trips</Link>
          <Link to="/new" className="btn btn-primary btn-sm">+ New trip</Link>
          <span className="muted small hide-mobile">{session.user.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Log out</button>
        </nav>
      ) : (
        <nav>
          <Link to="/login" className="btn btn-primary btn-sm">Log in</Link>
        </nav>
      )}
    </header>
  );
}
