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
