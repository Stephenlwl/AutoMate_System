import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageTowingBookingsComponent } from './manage-towing-bookings.component';

describe('ManageTowingBookingsComponent', () => {
  let component: ManageTowingBookingsComponent;
  let fixture: ComponentFixture<ManageTowingBookingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageTowingBookingsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageTowingBookingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
