import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterPanel } from './filter-panel';
import { Bus } from '../../models/bus.model';
import { FilterState } from '../../utils/bus-filters';

function makeBus(overrides: Partial<Bus> = {}): Bus {
  return {
    id: '1',
    operator: 'Coast Bus',
    from: 'Nairobi',
    to: 'Mombasa',
    date: '2026-08-27',
    departureTime: '6:30 AM',
    departureHour: 6,
    arrivalTime: '1:00 PM',
    duration: '6h 30m',
    busType: 'Luxury',
    price: 1800,
    seatsAvailable: 40,
    totalSeats: 44,
    classes: [],
    amenities: [],
    ...overrides,
  };
}

describe('FilterPanel', () => {
  let component: FilterPanel;
  let fixture: ComponentFixture<FilterPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FilterPanel] }).compileComponents();
    fixture = TestBed.createComponent(FilterPanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('derives operator, busType, and amenity options from the buses input', () => {
    fixture.componentRef.setInput('buses', [
      makeBus({ operator: 'Tahmeed', busType: 'Express', amenities: ['Wifi'] }),
      makeBus({ operator: 'Coast Bus', busType: 'Luxury', amenities: ['Water'] }),
    ]);
    fixture.detectChanges();

    expect(component.options().operators).toEqual(['Coast Bus', 'Tahmeed']);
    expect(component.options().busTypes).toEqual(['Express', 'Luxury']);
    expect(component.options().amenities).toEqual(['Water', 'Wifi']);
  });

  it('toggling a seat type twice ends unselected and emits the state each time', () => {
    const emitted: FilterState[] = [];
    component.filtersChange.subscribe((v) => emitted.push(v));

    component.toggleSeatType('VIP');
    component.toggleSeatType('VIP');

    expect(Array.from(emitted[0].seatTypes)).toEqual(['VIP']);
    expect(Array.from(emitted[1].seatTypes)).toEqual([]);
  });

  it('toggling amenities and departure times behaves as multi-select within each category', () => {
    component.toggleAmenity('Wifi');
    component.toggleAmenity('Water');
    component.toggleDepartureTime('Morning');

    expect(Array.from(component.selectedAmenities())).toEqual(['Wifi', 'Water']);
    expect(Array.from(component.selectedDepartureTimes())).toEqual(['Morning']);
  });

  it('setOperator selects a single operator; empty string clears it', () => {
    component.setOperator('Tahmeed');
    expect(component.selectedOperator()).toBe('Tahmeed');

    component.setOperator('');
    expect(component.selectedOperator()).toBeNull();
  });

  it('clearAll resets every selection back to empty', () => {
    component.toggleSeatType('VIP');
    component.toggleAmenity('Wifi');
    component.toggleBusType('Luxury');
    component.setOperator('Tahmeed');

    component.clearAll();

    expect(component.selectedSeatTypes().size).toBe(0);
    expect(component.selectedAmenities().size).toBe(0);
    expect(component.selectedBusTypes().size).toBe(0);
    expect(component.selectedDepartureTimes().size).toBe(0);
    expect(component.selectedOperator()).toBeNull();
  });
});
