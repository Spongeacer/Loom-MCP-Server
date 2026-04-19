import type { Binding } from '../types/index.js';

export function createBinding(
  source: string,
  target: string,
  relationship: Binding['relationship'] = 'depends_on',
  confidence = 0.9
): Binding {
  const now = new Date().toISOString();
  return {
    source,
    target,
    relationship,
    directionality: 'forward',
    status: 'active',
    confidence,
    confidence_model: {
      base: confidence,
      freshness_factor: 1.0,
      evidence_weight: 1.0,
      usage_boost: 1.0,
      drift_penalty: 0,
    },
    evidence: [{
      type: 'manual',
      detail: 'Created by knowledge tool',
      weight: 1.0,
      discovered: now,
    }],
    decay: {
      half_life_days: 90,
      last_reconfirmed: now,
    },
    invalidation: {
      invalidated_by: null,
      reason: null,
    },
    verification_history: [{
      date: now,
      method: 'tool_created',
      result: 'passed',
    }],
  };
}
