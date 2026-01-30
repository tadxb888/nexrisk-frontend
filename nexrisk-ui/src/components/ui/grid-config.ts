// ============================================
// AG-Grid Enterprise Setup
// ============================================

import { ModuleRegistry } from '@ag-grid-community/core';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { RowGroupingModule } from '@ag-grid-enterprise/row-grouping';
import { RichSelectModule } from '@ag-grid-enterprise/rich-select';
import { StatusBarModule } from '@ag-grid-enterprise/status-bar';
import { SideBarModule } from '@ag-grid-enterprise/side-bar';
import { ColumnToolPanelModule } from '@ag-grid-enterprise/column-tool-panel';
import { FilterToolPanelModule } from '@ag-grid-enterprise/filter-tool-panel';
import { SetFilterModule } from '@ag-grid-enterprise/set-filter';
import { MenuModule } from '@ag-grid-enterprise/menu';
import { ClipboardModule } from '@ag-grid-enterprise/clipboard';
import { ExcelExportModule } from '@ag-grid-enterprise/excel-export';

// Register all modules
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  RowGroupingModule,
  RichSelectModule,
  StatusBarModule,
  SideBarModule,
  ColumnToolPanelModule,
  FilterToolPanelModule,
  SetFilterModule,
  MenuModule,
  ClipboardModule,
  ExcelExportModule,
]);

// Default grid options for NexRisk
export const defaultGridOptions = {
  animateRows: true,
  enableCellTextSelection: true,
  suppressCellFocus: false,
  rowSelection: 'single' as const,
  suppressRowClickSelection: false,
  headerHeight: 36,
  rowHeight: 32,
  defaultColDef: {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 80,
  },
  statusBar: {
    statusPanels: [
      { statusPanel: 'agTotalRowCountComponent', align: 'left' },
      { statusPanel: 'agFilteredRowCountComponent' },
      { statusPanel: 'agSelectedRowCountComponent' },
    ],
  },
};

// Cell class rules for P&L coloring
export const pnlCellClassRules = {
  'cell-pnl-positive': (params: { value: number }) => params.value > 0,
  'cell-pnl-negative': (params: { value: number }) => params.value < 0,
};

// Cell class rules for risk levels
export const riskCellClassRules = {
  'cell-risk-critical': (params: { value: string }) => params.value === 'CRITICAL',
  'cell-risk-high': (params: { value: string }) => params.value === 'HIGH',
  'cell-risk-medium': (params: { value: string }) => params.value === 'MEDIUM',
  'cell-risk-low': (params: { value: string }) => params.value === 'LOW',
};

// Currency formatter
export function currencyFormatter(params: { value: number }): string {
  if (params.value == null) return '';
  const formatted = Math.abs(params.value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return params.value < 0 ? `-$${formatted}` : `$${formatted}`;
}

// Number formatter
export function numberFormatter(params: { value: number }, decimals: number = 2): string {
  if (params.value == null) return '';
  return params.value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Percentage formatter
export function percentFormatter(params: { value: number }): string {
  if (params.value == null) return '';
  return `${(params.value * 100).toFixed(2)}%`;
}
