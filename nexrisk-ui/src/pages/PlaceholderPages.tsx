// ============================================
// Placeholder Pages
// ============================================

// ExecutionReport has its own module — re-export so existing router imports keep working
export { ExecutionReportPage } from './ExecutionReport';

export function HedgeRulesPage() {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">Hedge Rules</h1>
        <p className="text-sm text-text-secondary">
          Define hedging triggers and cancellation rules
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center panel">
        <div className="text-center">
          <p className="text-text-muted mb-2">Hedge Rules Configuration</p>
          <p className="text-sm text-text-secondary">Coming soon</p>
        </div>
      </div>
    </div>
  );
}

export function PriceRulesPage() {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">Price Rules</h1>
        <p className="text-sm text-text-secondary">
          Configure spread multipliers and pricing adjustments
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center panel">
        <div className="text-center">
          <p className="text-text-muted mb-2">Price Rules Configuration</p>
          <p className="text-sm text-text-secondary">Coming soon</p>
        </div>
      </div>
    </div>
  );
}

export function CommandCenterPage() {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">Risk Command Center</h1>
        <p className="text-sm text-text-secondary">
          Executive situational awareness dashboard
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center panel">
        <div className="text-center">
          <p className="text-text-muted mb-2">Command Center Dashboard</p>
          <p className="text-sm text-text-secondary">Coming soon</p>
        </div>
      </div>
    </div>
  );
}

export function FlowHedgingPage() {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">Flow & Hedging Intelligence</h1>
        <p className="text-sm text-text-secondary">
          What should we hedge, unwind, or keep?
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center panel">
        <div className="text-center">
          <p className="text-text-muted mb-2">Flow Hedging Module</p>
          <p className="text-sm text-text-secondary">Coming soon</p>
        </div>
      </div>
    </div>
  );
}

export function BusinessPage() {
  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-4">
        <h1 className="text-lg font-medium text-text-primary">Business Performance</h1>
        <p className="text-sm text-text-secondary">
          Are we making the right money?
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center panel">
        <div className="text-center">
          <p className="text-text-muted mb-2">Business Performance Module</p>
          <p className="text-sm text-text-secondary">Coming soon</p>
        </div>
      </div>
    </div>
  );
}