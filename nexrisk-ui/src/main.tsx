import './lib/fetch-with-credentials';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// AG-Grid Enterprise License
import { LicenseManager } from 'ag-grid-enterprise';

LicenseManager.setLicenseKey(
  '[TRIAL]_this_{AG_Charts_and_AG_Grid}_Enterprise_key_{AG-136983}_is_granted_for_evaluation_only___Use_in_production_is_not_permitted___Please_report_misuse_to_legal@ag-grid.com___For_help_with_purchasing_a_production_key_please_contact_info@ag-grid.com___You_are_granted_a_{Single_Application}_Developer_License_for_one_application_only___All_Front-End_JavaScript_developers_working_on_the_application_would_need_to_be_licensed___This_key_will_deactivate_on_{27 August 2026}____[v3]_[0102]_MTc4Nzc4NTIwMDAwMA==43b7579cba9be9bea9fef437bd7ad091'
);

// Register AG-Grid modules
import './components/ui/grid-config';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);