import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';

ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule]);

// Uncomment and add your license key
// LicenseManager.setLicenseKey('YOUR_KEY');
