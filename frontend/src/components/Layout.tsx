import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

const Layout: React.FC = () => {
  return (
    <div className="flex h-[100dvh] overflow-hidden flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-surface">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
