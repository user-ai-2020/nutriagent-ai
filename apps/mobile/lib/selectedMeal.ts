let selectedMealId: number | null = null;

export function setSelectedMealId(id: number | null) {
  selectedMealId = id;
}

export function getSelectedMealId() {
  return selectedMealId;
}
