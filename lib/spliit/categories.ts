// Guesses a Spliit category from the MX category shown in the drawer. Spliit
// has one fixed list (prisma/migrations in spliit-app/spliit); the dialog
// remembers what was picked for each MX category, so this is only a start.
import type { Category } from './client';

// MX category name (lowercase) -> Spliit category name, where they differ.
const ALIASES: Record<string, string> = {
  restaurants: 'Dining Out',
  'fast food': 'Dining Out',
  'coffee shops': 'Dining Out',
  'food & dining': 'Food and Drink',
  'alcohol & bars': 'Liquor',
  'gas & fuel': 'Gas/Fuel',
  gas: 'Gas/Fuel',
  'auto & transport': 'Transportation',
  'auto insurance': 'Insurance',
  'service & parts': 'Car',
  'auto payment': 'Car',
  'public transportation': 'Bus/Train',
  'rental car & taxi': 'Taxi',
  'ride share': 'Taxi',
  'air travel': 'Plane',
  travel: 'Transportation',
  'home improvement': 'Maintenance',
  'home services': 'Services',
  'home supplies': 'Household Supplies',
  furnishings: 'Furniture',
  'mortgage & rent': 'Rent',
  'pet food & supplies': 'Pets',
  'electronics & software': 'Electronics',
  'movies & dvds': 'Movies',
  amusement: 'Entertainment',
  arts: 'Entertainment',
  'sporting goods': 'Sports',
  gift: 'Gifts',
  'gifts & donations': 'Gifts',
  charity: 'Donation',
  doctor: 'Medical Expenses',
  dentist: 'Medical Expenses',
  pharmacy: 'Medical Expenses',
  'health & fitness': 'Medical Expenses',
  'mobile phone': 'TV/Phone/Internet',
  internet: 'TV/Phone/Internet',
  television: 'TV/Phone/Internet',
  'gas & electric': 'Electricity',
  tuition: 'Education',
  'books & supplies': 'Education',
  'child care': 'Childcare',
  kids: 'Childcare',
};

export function guessCategory(mxCategory: string, categories: Category[]): number | undefined {
  const key = mxCategory.trim().toLowerCase();
  if (!key) return undefined;
  const byName = (name: string) => categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id;
  return byName(key) ?? (ALIASES[key] ? byName(ALIASES[key]) : undefined);
}
