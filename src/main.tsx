import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const stored = localStorage.getItem("photo-sorter-theme");
if (stored === "wal") {
  localStorage.setItem("photo-sorter-theme", "dark");
}
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const effective = localStorage.getItem("photo-sorter-theme");
document.documentElement.classList.toggle(
  "dark",
  effective === "dark" || (!effective && prefersDark),
);

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
