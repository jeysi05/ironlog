export interface UserProfile {
  id: string;
  gender: 'male' | 'female';
  age: number;
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number;
  activity_level: 'sedentary' | 'light' | 'moderate' | 'very_active';
  goal: 'aggressive_cut' | 'cut' | 'maintain' | 'lean_bulk';
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
}

export function computeTargets(
  gender: 'male' | 'female',
  age: number,
  height_cm: number,
  weight_kg: number,
  activity_level: UserProfile['activity_level'],
  goal: UserProfile['goal']
) {
  // Mifflin-St Jeor Equation
  const bmr =
    gender === 'male'
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;

  // Activity multipliers
  const multipliers: Record<UserProfile['activity_level'], number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    very_active: 1.725,
  };

  const tdee = bmr * (multipliers[activity_level] || 1.55);

  // Calorie Goal Modifiers
  const goalDeltas: Record<UserProfile['goal'], number> = {
    aggressive_cut: -650,
    cut: -450,
    maintain: 0,
    lean_bulk: 250,
  };

  const calories = Math.round(tdee + goalDeltas[goal]);

  // Macro Distribution:
  // Protein: 2.0g per kg of bodyweight (higher retention during cuts)
  const protein = Math.round(weight_kg * 2.0);
  // Fat: 25% of total caloric budget (9 kcal/g)
  const fat = Math.round((calories * 0.25) / 9);
  // Carbs: Remainder of calories (4 kcal/g)
  const carbs = Math.max(50, Math.round((calories - (protein * 4 + fat * 9)) / 4));

  return { calories, protein, carbs, fat, tdee: Math.round(tdee) };
}