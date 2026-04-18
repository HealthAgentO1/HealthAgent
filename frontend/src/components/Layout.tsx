import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

const Layout: React.FC = () => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-surface">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
