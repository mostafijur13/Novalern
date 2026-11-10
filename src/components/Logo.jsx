import { Link } from "react-router-dom";

export default function Logo({ to = "/", height = 34 }) {
  return (
    <Link to={to} className="logo" aria-label="Novalern home">
      <img src="/logo.png" alt="novalern." style={{ height }} />
    </Link>
  );
}
