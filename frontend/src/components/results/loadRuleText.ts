// Human copy for `risk.load_rule.rule` machine codes (docs/05-routing-weather-risk.md §6).
const LOAD_RULE_TEXT: Record<string, string> = {
  wind_ge_55: 'wind ≥ 55 mph → No Travel',
  wind_45_54_over_30000: 'wind 45–54 mph and load > 30,000 lb → No Travel',
  wind_35_44_over_40000: 'wind 35–44 mph and load > 40,000 lb → Severe',
};

export function describeLoadRule(rule: string | null): string | null {
  if (!rule) return null;
  return LOAD_RULE_TEXT[rule] ?? rule;
}
