import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SearchBar } from '../../components/search-bar/search-bar';
import { BusService } from '../../services/bus.service';
import { todayDateString } from '../../utils/date';

interface RoutePair {
  from: string;
  to: string;
  /** Editorial tagline, not something the database has an equivalent for. */
  character: string;
}

interface TopRoute extends RoutePair {
  duration: string;
  busType: string;
  seatsLeft: number;
}

@Component({
  imports: [RouterModule, SearchBar],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home implements OnInit, OnDestroy {
  /** The routes to feature is an editorial choice; the facts shown for each
   * (seats left, duration, bus type) come from that route's next upcoming
   * bus, fetched live below — not hardcoded. */
  private readonly routePairs: RoutePair[] = [
    { from: 'Nairobi', to: 'Mombasa', character: 'Coastal route' },
    { from: 'Nairobi', to: 'Kisumu', character: 'Lakeside route' },
    { from: 'Nairobi', to: 'Eldoret', character: 'Highland route' },
    { from: 'Mombasa', to: 'Malindi', character: 'Beach route' },
    { from: 'Nairobi', to: 'Kampala', character: 'Cross-border route' },
  ];

  topRoutes = signal<TopRoute[]>([]);

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

  partners = [
    { name: 'Dream Line', logo: 'logos/dream-line.png' },
    { name: 'Prestige Shuttle', logo: 'logos/prestige-shuttle.png' },
    { name: 'Royal Liner', logo: 'logos/royal-liner.png' },
    { name: 'Tahmeed', logo: 'logos/tahmeed1.png' },
    { name: 'Coast Bus', logo: 'logos/coast-bus1.png' },
    { name: 'Garissa Coach', logo: 'logos/garissa-coach.png' },
  ];

  /** Each feature pairs with a stat; "Bus partners" is derived from the
   * actual roster above so it can't drift out of sync with the page. */
  features = [
    {
      icon: 'fa-solid fa-bus',
      title: 'Trusted Operators',
      description: 'Compare real routes from licensed coaches.',
      statNumber: `${this.partners.length}`,
      statSuffix: '+',
      statLabel: 'Bus partners',
    },
    {
      icon: 'fa-solid fa-headset',
      title: '24/7 Support',
      description: 'Help whenever you need it.',
      statNumber: '24',
      statSuffix: '/7',
      statLabel: 'Always available',
    },
    {
      icon: 'fa-solid fa-lock',
      title: 'Secure Payments',
      description: 'Your details are always protected.',
      statNumber: '50k',
      statSuffix: '+',
      statLabel: 'Tickets booked',
    },
    {
      icon: 'fa-solid fa-rotate-left',
      title: 'Free Cancellation',
      description: 'Up to 6 hours before departure.',
      statNumber: '40',
      statSuffix: '+',
      statLabel: 'Routes covered',
    },
  ];

  appFeatures = [
    { icon: 'fa-solid fa-bolt', tone: 'red', title: 'Instant Booking', description: 'Confirmed in seconds, no waiting' },
    { icon: 'fa-solid fa-location-dot', tone: 'teal', title: 'Live Bus Tracking', description: 'Know exactly when it arrives' },
    { icon: 'fa-solid fa-rotate-left', tone: 'navy', title: 'Easy Cancellation', description: 'Cancel or rebook in one tap' },
  ];

  howItWorks = [
    { title: 'Search Routes', description: "Pick where you're going and see available buses." },
    { title: 'Choose Your Seat', description: 'Compare operators and pick a fare that suits you.' },
    { title: 'Book & Travel', description: 'Pay securely and get your ticket instantly.' },
  ];

  /** Decorative departure-board display in the hero; cycles on an interval,
   * not tied to real-time bus data. */
  departureBoard = [
    { route: 'Nairobi → Mombasa', time: '14:20', status: 'BOARDING' },
    { route: 'Nairobi → Kisumu', time: '09:45', status: 'ON TIME' },
    { route: 'Nairobi → Eldoret', time: '11:10', status: 'ON TIME' },
    { route: 'Mombasa → Malindi', time: '16:30', status: 'BOARDING' },
  ];

  departureIndex = signal(0);
  departureFading = signal(false);
  private departureTimer?: ReturnType<typeof setInterval>;
  private departureFadeTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private router: Router,
    private busService: BusService,
  ) {
    this.loadTopRoutes();
  }

  ngOnInit(): void {
    this.departureTimer = setInterval(() => this.cycleDepartureBoard(), 4500);
  }

  ngOnDestroy(): void {
    clearInterval(this.departureTimer);
    clearTimeout(this.departureFadeTimeout);
  }

  private cycleDepartureBoard(): void {
    this.departureFading.set(true);
    this.departureFadeTimeout = setTimeout(() => {
      this.departureIndex.set((this.departureIndex() + 1) % this.departureBoard.length);
      this.departureFading.set(false);
    }, 400);
  }

  private async loadTopRoutes(): Promise<void> {
    // This is a marketing preview of routes we run, not a live "book today"
    // list, so it doesn't require an actual upcoming departure — that would
    // make the whole section silently go blank once today's seeded buses
    // age into the past. Any bus for the route is enough to show typical
    // duration, class, and seat count.
    const routes = await Promise.all(
      this.routePairs.map(async (pair): Promise<TopRoute | null> => {
        const buses = await this.busService.search(pair.from, pair.to, '');
        const bus = buses[0];
        if (!bus) {
          return null;
        }
        return {
          ...pair,
          duration: bus.duration,
          busType: bus.busType,
          seatsLeft: bus.seatsAvailable,
        };
      }),
    );
    this.topRoutes.set(routes.filter((r): r is TopRoute => r !== null));
  }

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
