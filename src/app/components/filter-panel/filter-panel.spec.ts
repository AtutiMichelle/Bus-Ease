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

  it('derives operator and amenity options from the buses input', () => {
    fixture.componentRef.setInput('buses', [
      makeBus({ operator: 'Tahmeed', amenities: ['Wifi'] }),
      makeBus({ operator: 'Coast Bus', amenities: ['Water'] }),
    ]);
    fixture.detectChanges();

    expect(component.options().operators).toEqual(['Coast Bus', 'Tahmeed']);
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

  it('toggling amenities behaves as multi-select', () => {
    component.toggleAmenity('Wifi');
    component.toggleAmenity('Water');

    expect(Array.from(component.selectedAmenities())).toEqual(['Wifi', 'Water']);
  });

  it('setOperator selects a single operator; empty string clears it', () => {
    component.setOperator('Tahmeed');
    expect(component.selectedOperator()).toBe('Tahmeed');

    component.setOperator('');
    expect(component.selectedOperator()).toBeNull();
  });

  it('starts with the full departure range (no filter) and seatType section expanded', () => {
    expect(component.isDepartureRangeActive()).toBe(false);
    expect(component.isSectionExpanded('seatType')).toBe(true);
    expect(component.isSectionExpanded('departureTime')).toBe(false);
  });

  it('toggleSection flips a section open and closed', () => {
    component.toggleSection('amenities');
    expect(component.isSectionExpanded('amenities')).toBe(true);

    component.toggleSection('amenities');
    expect(component.isSectionExpanded('amenities')).toBe(false);
  });

  it('toggleZone selects a zone range, and tapping the same zone again clears it', () => {
    const emitted: FilterState[] = [];
    component.filtersChange.subscribe((v) => emitted.push(v));

    component.toggleZone('Morning');
    expect(emitted[0].departureRange).toEqual({ start: 5, end: 12 });
    expect(component.isZoneActive('Morning')).toBe(true);

    component.toggleZone('Morning');
    expect(emitted[1].departureRange).toBeNull();
    expect(component.isZoneActive('Morning')).toBe(false);
  });

  it('dragging the start thumb past the current end clamps it to end', () => {
    component.onRangeStartInput('35');
    expect(component.rangeStart()).toBe(component.rangeEnd());
  });

  it('dragging the end thumb below the current start clamps it to start', () => {
    component.onRangeEndInput('0');
    expect(component.rangeEnd()).toBe(component.rangeStart());
  });

  it('activeFilterCount counts every active filter value across categories', () => {
    component.toggleSeatType('VIP');
    component.toggleSeatType('Business');
    component.toggleAmenity('Wifi');
    component.setOperator('Tahmeed');
    component.toggleZone('Evening');

    expect(component.activeFilterCount()).toBe(5);
  });

  it('clearAll resets every selection and the departure range back to empty', () => {
    component.toggleSeatType('VIP');
    component.toggleAmenity('Wifi');
    component.setOperator('Tahmeed');
    component.toggleZone('Evening');

    component.clearAll();

    expect(component.selectedSeatTypes().size).toBe(0);
    expect(component.selectedAmenities().size).toBe(0);
    expect(component.selectedOperator()).toBeNull();
    expect(component.isDepartureRangeActive()).toBe(false);
    expect(component.activeFilterCount()).toBe(0);
  });
});
