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
  arrivalTime: string;
  duration: string;
  busType: 'Luxury' | 'Standard' | 'Express';
  price: number;
  seatsAvailable: number;
  totalSeats: number;
  classes: BusClassOption[];
  /** Not tracked in the database yet; only the old mock data set this. */
  rating?: number;
}
