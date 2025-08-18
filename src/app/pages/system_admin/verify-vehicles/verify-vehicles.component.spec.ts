import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VerifyVehiclesComponent } from './verify-vehicles.component';

describe('VerifyVehiclesComponent', () => {
  let component: VerifyVehiclesComponent;
  let fixture: ComponentFixture<VerifyVehiclesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifyVehiclesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VerifyVehiclesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
