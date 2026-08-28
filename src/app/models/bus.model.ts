export interface BusClassOption {
  className: 'VIP' | 'Business' | 'Normal';
  price: number;
}

export interface Bus {
  id: string;
  operator: string;
  from: string;
  to: string;
  date: string;
  departureTime: string;
  /** Raw 24-hour departure hour (0-23), for filtering by time-of-day bucket. */
  departureHour: number;
  arrivalTime: string;
  duration: string;
  busType: 'Luxury' | 'Standard' | 'Express';
  price: number;
  seatsAvailable: number;
  totalSeats: number;
  classes: BusClassOption[];
  amenities: string[];
  /** Not tracked in the database yet; only the old mock data set this. */
  rating?: number;
}
