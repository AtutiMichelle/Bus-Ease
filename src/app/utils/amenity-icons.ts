const AMENITY_ICONS: Record<string, string> = {
  'Air Conditioning': 'fa-snowflake',
  'Dvd Player': 'fa-compact-disc',
  Wifi: 'fa-wifi',
  'Phone Charging': 'fa-plug',
  'GPS Tracking': 'fa-location-dot',
  Water: 'fa-droplet',
  Newspaper: 'fa-newspaper',
  Tea: 'fa-mug-hot',
};

export function amenityIcon(name: string): string {
  return AMENITY_ICONS[name] ?? 'fa-circle-check';
}

/** Reuses the app's existing theme tokens so each amenity reads as a distinct color without introducing new hardcoded hex values. */
const AMENITY_COLORS: Record<string, string> = {
  'Air Conditioning': 'var(--color-primary, #1e88e5)',
  Wifi: 'var(--color-success, #16a34a)',
  'GPS Tracking': 'var(--color-accent, #eb1f1a)',
  Water: 'var(--color-primary, #1e88e5)',
  'Phone Charging': 'var(--color-accent-dark, #d68c0f)',
  'Dvd Player': 'var(--color-danger, #d64545)',
  Newspaper: 'var(--color-text, #3a3a3a)',
  Tea: 'var(--color-accent-dark, #d68c0f)',
};

export function amenityColor(name: string): string {
  return AMENITY_COLORS[name] ?? 'var(--color-text, #3a3a3a)';
}
