import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Results } from './results';

describe('Results', () => {
  let component: Results;
  let fixture: ComponentFixture<Results>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Results],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Results);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
