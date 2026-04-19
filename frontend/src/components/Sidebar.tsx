import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", icon: "dashboard", label: "Dashboard" },
  { to: "/symptom-check", icon: "medical_services", label: "Symptom Check" },
  { to: "/prior-diagnoses", icon: "clinical_notes", label: "My prior diagnoses" },
  {
    to: "/medication-safety",
    icon: "pill",
    label: "Medication Safety",
  },
  { to: "/reports", icon: "assessment", label: "Reports" },
  { to: "/settings", icon: "manage_accounts", label: "Settings & profile" },
];

const Sidebar: React.FC = () => {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileHeaderRef = useRef<HTMLElement>(null);
  const [dropdownTopPx, setDropdownTopPx] = useState(0);

  const handleSignOut = () => {
    setMobileOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useLayoutEffect(() => {
    if (!mobileOpen) return;
    const el = mobileHeaderRef.current;
    if (!el) return;
    const sync = () => setDropdownTopPx(el.getBoundingClientRect().bottom);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("orientationchange", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", sync);
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile: top bar + dropdown panel (desktop sidebar is hidden below md) */}
      <div className="relative z-[100] shrink-0 md:hidden">
        {mobileOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}
        <header
          ref={mobileHeaderRef}
          className="relative z-50 flex items-center justify-between gap-3 border-b border-outline-variant/25 bg-surface-container-low px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]"
        >
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-lg text-primary hover:bg-surface-container-high/90"
              aria-expanded={mobileOpen}
              aria-controls="mobile-app-nav"
              aria-haspopup="true"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((o) => !o)}
            >
              <span className="material-symbols-outlined text-2xl">
                {mobileOpen ? "close" : "menu"}
              </span>
            </button>
            <NavLink
              to="/emergency"
              className="inline-flex size-11 items-center justify-center rounded-lg text-error hover:bg-error-container/40"
              aria-label="Emergency contacts"
            >
              <span
                className="material-symbols-outlined text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                emergency
              </span>
            </NavLink>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5 text-right">
            <div className="min-w-0">
              <p className="font-headline text-base font-extrabold leading-tight tracking-tight text-primary">
                HealthOS
              </p>
              <p className="truncate font-body text-[11px] font-medium text-on-surface-variant">
                Clinical Sanctuary
              </p>
            </div>
            <img
              src="/icon.png"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-lg object-contain shadow-[0_4px_12px_rgba(24,28,32,0.12)]"
            />
          </div>
        </header>

        {mobileOpen ? (
          <div
            className="fixed left-0 right-0 z-50 overflow-y-auto border-b border-outline-variant/25 bg-surface-container-lowest pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_16px_40px_rgba(24,28,32,0.14)] md:hidden"
            id="mobile-app-nav"
            role="navigation"
            aria-label="Main menu"
            style={{
              top: dropdownTopPx,
              maxHeight: `min(70vh, calc(100dvh - ${dropdownTopPx}px - 0.5rem))`,
            }}
          >
            <nav className="flex flex-col gap-0.5 p-2 font-headline font-semibold">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  end={item.to === "/"}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                      isActive
                        ? "bg-primary-fixed/20 font-bold text-[#004E98] ring-1 ring-primary/25"
                        : "text-slate-600 hover:bg-surface-container-high hover:text-[#004E98]"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className="material-symbols-outlined shrink-0 text-xl"
                        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="mx-2 mb-2 rounded-lg border border-outline-variant/30 bg-surface-container-high/80 px-3 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Signed in
              </p>
              <p className="truncate text-sm font-medium text-on-surface" title={email ?? undefined}>
                {email ?? "—"}
              </p>
              <button
                type="button"
                className="mt-3 w-fit cursor-pointer rounded-lg px-0 py-2.5 text-left text-sm font-semibold text-primary hover:bg-surface-container-lowest/80"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="hidden h-screen w-72 shrink-0 flex-col gap-y-2 bg-surface-container-low px-4 py-8 md:flex">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-3 px-4">
          <img
            src="/icon.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-lg object-contain shadow-[0_4px_12px_rgba(24,28,32,0.12)]"
          />
          <div>
            <h1 className="font-headline text-lg font-extrabold leading-none tracking-tight text-primary">
              HealthOS
            </h1>
            <p className="mt-1 text-xs font-medium text-on-surface-variant">Clinical Sanctuary</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 font-headline font-semibold">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-300 ${
                  isActive
                    ? "translate-x-1 border-r-4 border-[#004E98] bg-surface-container-lowest font-bold text-[#004E98] shadow-[0_2px_8px_rgba(24,28,32,0.02)]"
                    : "text-slate-500 opacity-80 hover:bg-surface-container-high hover:text-[#004E98]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className="material-symbols-outlined text-xl transition-transform group-hover:scale-110"
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
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
        <div className="mb-1.5 w-full">
          <NavLink
            to="/emergency"
            className={({ isActive }) =>
              `flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 font-headline font-semibold transition-colors ${
                isActive
                  ? "border-error bg-error text-on-error shadow-sm"
                  : "border-error-container/50 bg-error-container text-on-error-container hover:bg-[#ffcdc8]"
              }`
            }
          >
            <span
              className="material-symbols-outlined text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              emergency
            </span>
            Emergency Contacts
          </NavLink>
        </div>

        <div className="mb-1 mt-auto rounded-lg border border-outline-variant/30 bg-surface-container-high/80 px-2 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Signed in
          </p>
          <p className="truncate text-sm font-medium text-on-surface" title={email ?? undefined}>
            {email ?? "—"}
          </p>
          <button
            type="button"
            className="mt-2 w-fit cursor-pointer text-left text-sm font-semibold text-primary hover:underline"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
