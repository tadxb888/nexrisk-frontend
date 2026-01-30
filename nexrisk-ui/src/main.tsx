import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// AG-Grid Enterprise License (placeholder - add your license key)
// import { LicenseManager } from '@ag-grid-enterprise/core';
// LicenseManager.setLicenseKey('YOUR_LICENSE_KEY');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
