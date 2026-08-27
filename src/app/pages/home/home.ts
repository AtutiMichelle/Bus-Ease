import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SearchBar } from '../../components/search-bar/search-bar';
import { todayDateString } from '../../utils/date';

interface TopRoute {
  from: string;
  to: string;
  departure: string;
  priceRange: string;
  duration: string;
  busType: string;
  character: string;
  icon: string;
  seatsLeft: number;
}

@Component({
  imports: [RouterModule, SearchBar],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  topRoutes: TopRoute[] = [
    { from: 'Nairobi', to: 'Mombasa', departure: '08:00 AM', priceRange: 'KSh 1,200 - 2,500', duration: '6h 30m', busType: 'Luxury', character: 'Coastal route', icon: 'fa-solid fa-anchor', seatsLeft: 12 },
    { from: 'Nairobi', to: 'Kisumu', departure: '07:30 AM', priceRange: 'KSh 900 - 1,800', duration: '5h 00m', busType: 'Standard', character: 'Lakeside route', icon: 'fa-solid fa-water', seatsLeft: 4 },
    { from: 'Nairobi', to: 'Eldoret', departure: '09:00 AM', priceRange: 'KSh 800 - 1,500', duration: '4h 30m', busType: 'Express', character: 'Highland route', icon: 'fa-solid fa-mountain', seatsLeft: 22 },
    { from: 'Mombasa', to: 'Malindi', departure: '10:00 AM', priceRange: 'KSh 400 - 800', duration: '2h 00m', busType: 'Standard', character: 'Beach route', icon: 'fa-solid fa-umbrella-beach', seatsLeft: 8 },
    { from: 'Nairobi', to: 'Kampala', departure: '06:00 PM', priceRange: 'KSh 2,500 - 4,000', duration: '12h 00m', busType: 'Luxury', character: 'Cross-border route', icon: 'fa-solid fa-passport', seatsLeft: 6 },
  ];

  /** Real photos of the actual cities on offer, not stock imagery. */
  private cityPhotos: Record<string, string> = {
    Nairobi: 'https://images.unsplash.com/photo-1741991110666-88115e724741?fm=jpg&q=70&w=600&auto=format&fit=crop',
    Mombasa: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Mombasa_tusks%2C_2025_%2808%29.jpg',
    Kisumu: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/Kisumu_skyline.jpg',
    Eldoret: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Skyline_of_Eldoret_Facing_West_from_Mups_Plaza.jpg',
    Malindi: 'https://images.unsplash.com/photo-1633345778967-3760204a4c57?fm=jpg&q=70&w=600&auto=format&fit=crop',
    Kampala: 'https://images.unsplash.com/photo-1675756261486-09bd1e0f6c8a?fm=jpg&q=70&w=600&auto=format&fit=crop',
  };

  cityPhoto(town: string): string {
    return this.cityPhotos[town] ?? this.cityPhotos['Nairobi'];
  }

  features = [
    { icon: 'fa-solid fa-bus', title: 'Trusted Operators', description: 'Compare real routes from licensed coaches.' },
    { icon: 'fa-solid fa-headset', title: '24/7 Support', description: 'Help whenever you need it.' },
    { icon: 'fa-solid fa-lock', title: 'Secure Payments', description: 'Your details are always protected.' },
    { icon: 'fa-solid fa-rotate-left', title: 'Free Cancellation', description: 'Up to 6 hours before departure.' },
  ];

    partners = [
    { name: 'Dream Line', logo: 'logos/dream-line.png' },
    { name: 'Prestige Shuttle', logo: 'logos/prestige-shuttle.png' },
    { name: 'Royal Liner', logo: 'logos/royal-liner.png' },
    { name: 'Tahmeed', logo: 'logos/tahmeed1.png' },
    { name: 'Coast Bus', logo: 'logos/coast-bus1.png' },
    { name: 'Garissa Coach', logo: 'logos/garissa-coach.png' },
  ];

  /** "Bus Partners" is derived from the actual roster below so this
   * number can't drift out of sync with what's really on the page. */
  aboutStats = [
    { value: '50,000+', label: 'Tickets Booked' },
    { value: `${this.partners.length}`, label: 'Bus Partners' },
    { value: '40+', label: 'Routes Covered' },
    { value: '24/7', label: 'Customer Support' },
  ];

    testimonials = [
    { quote: 'Booking took two minutes.', name: 'Wanjiru K.', location: 'Nairobi', date: 'Jul 2026', rating: 5 },
    { quote: 'Seat map was clear.', name: 'Otieno M.', location: 'Kisumu', date: 'Jun 2026', rating: 4 },
    { quote: 'Refund was instant.', name: 'Amina H.', location: 'Mombasa', date: 'Aug 2026', rating: 5 },
  ];

  constructor(private router: Router) {}

  selectRoute(route: TopRoute): void {
    this.router.navigate(['/results'], {
      queryParams: {
        origin: route.from,
        destination: route.to,
        journeyDate: todayDateString(),
      },
    });
  }
}
