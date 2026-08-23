import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, type AppConfig } from './App';
import './planner.css';

const root = document.getElementById('planner-root');
if (root) {
  const cfg: AppConfig = {
    projectId: parseInt(root.dataset.projectId!, 10),
    statuses: JSON.parse(root.dataset.statuses!),
    urls: JSON.parse(root.dataset.urls!),
  };
  createRoot(root).render(<React.StrictMode><App cfg={cfg} /></React.StrictMode>);
}
