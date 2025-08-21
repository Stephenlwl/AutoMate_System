import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateServiceCenterTowingDriverComponent } from './validate-service-center-towing-driver.component';

describe('ValidateServiceCenterTowingDriverComponent', () => {
  let component: ValidateServiceCenterTowingDriverComponent;
  let fixture: ComponentFixture<ValidateServiceCenterTowingDriverComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateServiceCenterTowingDriverComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateServiceCenterTowingDriverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
