import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageStaffTowingDriverComponent } from './manage-staff-towing-driver.component';

describe('ManageStaffTowingDriverComponent', () => {
  let component: ManageStaffTowingDriverComponent;
  let fixture: ComponentFixture<ManageStaffTowingDriverComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageStaffTowingDriverComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageStaffTowingDriverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
