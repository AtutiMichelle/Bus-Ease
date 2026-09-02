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

  it('derives operator and bus type options from the buses input', () => {
    fixture.componentRef.setInput('buses', [
      makeBus({ operator: 'Tahmeed', busType: 'Standard' }),
      makeBus({ operator: 'Coast Bus', busType: 'Luxury' }),
    ]);
    fixture.detectChanges();

    expect(component.options().operators).toEqual(['Coast Bus', 'Tahmeed']);
    expect(component.options().busTypes).toEqual(['Luxury', 'Standard']);
  });

  it('toggling a seat type twice ends unselected and emits the state each time', () => {
    const emitted: FilterState[] = [];
    component.filtersChange.subscribe((v) => emitted.push(v));

    component.toggleSeatType('VIP');
    component.toggleSeatType('VIP');

    expect(Array.from(emitted[0].seatTypes)).toEqual(['VIP']);
    expect(Array.from(emitted[1].seatTypes)).toEqual([]);
  });

  it('toggling amenities behaves as multi-select', () => {
    component.toggleAmenity('Wifi');
    component.toggleAmenity('Water');

    expect(Array.from(component.selectedAmenities())).toEqual(['Wifi', 'Water']);
  });

  it('toggling departure times behaves as multi-select, unlike a single-select range', () => {
    component.toggleDepartureTime('Morning');
    component.toggleDepartureTime('Evening');

    expect(Array.from(component.selectedDepartureTimes())).toEqual(['Morning', 'Evening']);
  });

  it('toggling a bus type twice ends unselected', () => {
    component.toggleBusType('Express');
    expect(component.selectedBusTypes().has('Express')).toBe(true);

    component.toggleBusType('Express');
    expect(component.selectedBusTypes().has('Express')).toBe(false);
  });

  it('setOperator selects a single operator; empty string clears it', () => {
    component.setOperator('Tahmeed');
    expect(component.selectedOperator()).toBe('Tahmeed');

    component.setOperator('');
    expect(component.selectedOperator()).toBeNull();
  });

  it('counts each seat type against the full unfiltered bus list', () => {
    fixture.componentRef.setInput('buses', [
      makeBus({ classes: [{ className: 'VIP', price: 4000 }] }),
      makeBus({ classes: [{ className: 'Business', price: 3000 }] }),
      makeBus({ classes: [{ className: 'VIP', price: 4200 }] }),
    ]);
    fixture.detectChanges();

    expect(component.seatTypeCounts().get('VIP')).toBe(2);
    expect(component.seatTypeCounts().get('Business')).toBe(1);
    expect(component.seatTypeCounts().get('Normal')).toBe(0);
  });

  it('clearAll resets every selection back to empty', () => {
    component.toggleSeatType('VIP');
    component.toggleAmenity('Wifi');
    component.setOperator('Tahmeed');
    component.toggleDepartureTime('Evening');
    component.toggleBusType('Express');

    component.clearAll();

    expect(component.selectedSeatTypes().size).toBe(0);
    expect(component.selectedAmenities().size).toBe(0);
    expect(component.selectedOperator()).toBeNull();
    expect(component.selectedDepartureTimes().size).toBe(0);
    expect(component.selectedBusTypes().size).toBe(0);
  });
});
