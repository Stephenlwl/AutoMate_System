import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateWorkshopStaffComponent } from './validate-workshop-staff.component';

describe('ValidateWorkshopStaffComponent', () => {
  let component: ValidateWorkshopStaffComponent;
  let fixture: ComponentFixture<ValidateWorkshopStaffComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateWorkshopStaffComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateWorkshopStaffComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
