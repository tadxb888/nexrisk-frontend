import type { Role, Capability } from '../types/index.js';

/**
 * Role-based Access Control Configuration
 * Maps roles to their allowed capabilities
 */

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  exec_readonly: [
    'traders.read',
    'positions.read',
    'orders.read',
    'alerts.read',
    'clustering.read',
    'risk_matrix.read',
    'predictions.read',
  ],

  risk_ops: [
    'traders.read',
    'traders.details',
    'positions.read',
    'orders.read',
    'alerts.read',
    'alerts.ack',
    'alerts.resolve',
    'explain.generate',
    'clustering.read',
    'risk_matrix.read',
    'predictions.read',
    'llm.status',
  ],

  risk_admin: [
    'traders.read',
    'traders.details',
    'positions.read',
    'orders.read',
    'alerts.read',
    'alerts.ack',
    'alerts.resolve',
    'explain.generate',
    'clustering.read',
    'clustering.run',
    'risk_matrix.read',
    'risk_matrix.write',
    'config.read',
    'config.write',
    'predictions.read',
    'llm.status',
  ],

  it_observer: [
    'traders.read',
    'positions.read',
    'orders.read',
    'alerts.read',
    'clustering.read',
    'risk_matrix.read',
    'config.read',
    'llm.status',
  ],
};

/**
 * Check if a role has a specific capability
 */
export function roleHasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

/**
 * Get all capabilities for a role
 */
export function getCapabilitiesForRole(role: Role): Capability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

/**
 * Capability descriptions for UI/audit purposes
 */
export const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
  'traders.read': 'View trader list and basic info',
  'traders.details': 'View detailed trader information including features',
  'positions.read': 'View open positions',
  'orders.read': 'View pending orders',
  'alerts.read': 'View alerts',
  'alerts.ack': 'Acknowledge alerts',
  'alerts.resolve': 'Resolve alerts',
  'explain.generate': 'Generate Claude explanations on-demand',
  'clustering.read': 'View clustering results',
  'clustering.run': 'Trigger clustering runs',
  'risk_matrix.read': 'View risk matrix rules',
  'risk_matrix.write': 'Modify risk matrix rules',
  'config.read': 'View system configuration',
  'config.write': 'Modify system configuration',
  'predictions.read': 'View NexDay predictions',
  'llm.status': 'View LLM provider status',
};

/**
 * WebSocket topics each role can subscribe to
 */
export const ROLE_WS_TOPICS: Record<Role, string[]> = {
  exec_readonly: ['alerts', 'health'],
  risk_ops: ['events', 'alerts', 'trader', 'health'],
  risk_admin: ['events', 'alerts', 'trader', 'clustering', 'health'],
  it_observer: ['alerts', 'health'],
};

/**
 * Check if a role can subscribe to a WebSocket topic
 */
export function roleCanSubscribe(role: Role, topic: string): boolean {
  return ROLE_WS_TOPICS[role]?.includes(topic) ?? false;
}
