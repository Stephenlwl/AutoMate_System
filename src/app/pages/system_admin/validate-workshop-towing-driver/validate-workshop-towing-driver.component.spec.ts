import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateWorkshopTowingDriverComponent } from './validate-workshop-towing-driver.component';

describe('ValidateWorkshopTowingDriverComponent', () => {
  let component: ValidateWorkshopTowingDriverComponent;
  let fixture: ComponentFixture<ValidateWorkshopTowingDriverComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateWorkshopTowingDriverComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateWorkshopTowingDriverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
