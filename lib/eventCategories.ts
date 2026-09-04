export const EVENT_CATEGORIES = [
  { slug: 'load-events', value: 'load', label: 'Load Events' },
  { slug: 'click-events', value: 'click', label: 'Click Events' },
  { slug: 'form-events', value: 'form', label: 'Form Events' },
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventCategorySlug = EventCategory['slug'];
export type EventCategoryValue = EventCategory['value'];

export const EVENT_CATEGORY_VALUES = EVENT_CATEGORIES.map((c) => c.value) as [
  EventCategoryValue,
  ...EventCategoryValue[],
];

export function getCategoryBySlug(slug: string): EventCategory | undefined {
  return EVENT_CATEGORIES.find((c) => c.slug === slug);
}

export function getCategoryByValue(value: string): EventCategory | undefined {
  return EVENT_CATEGORIES.find((c) => c.value === value);
}
