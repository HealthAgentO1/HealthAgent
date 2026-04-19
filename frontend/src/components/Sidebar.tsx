import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", icon: "dashboard", label: "Dashboard" },
  { to: "/symptom-check", icon: "medical_services", label: "Symptom Check" },
  { to: "/care-matches", icon: "person_search", label: "Care Matches" },
  {
    to: "/medication-safety",
    icon: "pill",
    label: "Medication Safety",
  },
  { to: "/reports", icon: "assessment", label: "Reports" },
];

const Sidebar: React.FC = () => {
  const { email, logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="hidden md:flex h-screen w-72 bg-surface-container-low flex-col py-8 px-4 gap-y-2 shrink-0">
      {/* Brand */}
      <div className="px-4 mb-8 flex items-center gap-3">
        <img
          src="/icon.png"
          alt=""
          width={40}
          height={40}
          className="w-10 h-10 rounded-lg object-contain shadow-[0_4px_12px_rgba(24,28,32,0.12)] shrink-0"
        />
        <div>
          <h1 className="text-lg font-extrabold text-primary font-headline tracking-tight leading-none">
            HealthOS
          </h1>
          <p className="text-xs text-on-surface-variant font-medium mt-1">
            Clinical Sanctuary
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 font-headline font-semibold">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 group ${
                isActive
                  ? "text-[#004E98] font-bold border-r-4 border-[#004E98] bg-surface-container-lowest translate-x-1 shadow-[0_2px_8px_rgba(24,28,32,0.02)]"
                  : "text-slate-500 opacity-80 hover:bg-surface-container-high hover:text-[#004E98]"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform"
                  style={
                    isActive
                      ? { fontVariationSettings: "'FILL' 1" }
                      : undefined
                  }
                >
                  {item.icon}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-3 mb-2 rounded-lg bg-surface-container-high/80 border border-outline-variant/30">
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">
          Signed in
        </p>
        <p
          className="text-sm font-medium text-on-surface truncate"
          title={email ?? undefined}
        >
          {email ?? "—"}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-2 w-full text-left text-sm font-semibold text-primary hover:underline"
        >
          Sign out
        </button>
      </div>

      {/* Emergency CTA */}
      <div className="mt-auto px-2">
        <NavLink
          to="/emergency"
          className={({ isActive }) =>
            `w-full py-3 px-4 rounded-lg font-headline font-semibold flex items-center justify-center gap-2 transition-colors border ${
              isActive
                ? "bg-error text-on-error border-error shadow-sm"
                : "bg-error-container text-on-error-container hover:bg-[#ffcdc8] border-error-container/50"
            }`
          }
        >
          <span
            className="material-symbols-outlined text-lg"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            emergency
          </span>
          Emergency Contact
        </NavLink>
      </div>
    </aside>
  );
};

export default Sidebar;
