import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageServiceBookingsComponent } from './manage-service-bookings.component';

describe('ManageServiceBookingsComponent', () => {
  let component: ManageServiceBookingsComponent;
  let fixture: ComponentFixture<ManageServiceBookingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageServiceBookingsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageServiceBookingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
