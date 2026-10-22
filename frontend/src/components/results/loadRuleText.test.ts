import { describe, expect, it } from 'vitest';
import { describeLoadRule } from './loadRuleText';

describe('describeLoadRule', () => {
  it('returns null when no rule applied', () => {
    expect(describeLoadRule(null)).toBeNull();
  });

  it('translates the wind_35_44_over_40000 rule to the spec example copy', () => {
    expect(describeLoadRule('wind_35_44_over_40000')).toBe('wind 35–44 mph and load > 40,000 lb → Severe');
  });

  it('translates wind_ge_55 and wind_45_54_over_30000', () => {
    expect(describeLoadRule('wind_ge_55')).toContain('No Travel');
    expect(describeLoadRule('wind_45_54_over_30000')).toContain('No Travel');
  });

  it('falls back to the raw code for an unrecognized rule', () => {
    expect(describeLoadRule('some_future_rule')).toBe('some_future_rule');
  });
});
