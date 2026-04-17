export interface UserPreferences {
  currencyCode: string;
  currentCash: number | null;
  cashBaselineDate: string | null;
  dueObligationsFilterPreset: 'upcoming30Days' | 'upcoming15Days' | 'currentMonth' | 'currentFortnight';
}
