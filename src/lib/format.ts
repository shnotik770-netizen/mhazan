export function formatCurrency(amount: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(amount);
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("he-IL").format(new Date(date));
}
