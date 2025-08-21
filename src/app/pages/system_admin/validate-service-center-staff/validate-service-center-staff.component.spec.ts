import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateServiceCenterStaffComponent } from './validate-service-center-staff.component';

describe('ValidateServiceCenterStaffComponent', () => {
  let component: ValidateServiceCenterStaffComponent;
  let fixture: ComponentFixture<ValidateServiceCenterStaffComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateServiceCenterStaffComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateServiceCenterStaffComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
