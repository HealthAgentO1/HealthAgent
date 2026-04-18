import React from "react";
import { NavLink } from "react-router-dom";

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
  return (
    <aside className="hidden md:flex h-screen w-72 bg-surface-container-low flex-col py-8 px-4 gap-y-2 shrink-0">
      {/* Brand */}
      <div className="px-4 mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center shadow-[0_4px_12px_rgba(0,55,111,0.2)]">
          <span className="material-symbols-outlined text-on-primary icon-fill">
            health_and_safety
          </span>
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-primary font-headline tracking-tight leading-none">
            Health Guardian
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

      {/* Emergency CTA */}
      <div className="mt-auto px-2">
        <button className="w-full py-3 px-4 rounded-lg bg-error-container text-on-error-container font-headline font-semibold flex items-center justify-center gap-2 hover:bg-[#ffcdc8] transition-colors border border-error-container/50">
          <span
            className="material-symbols-outlined text-lg"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            emergency
          </span>
          Emergency Contact
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
