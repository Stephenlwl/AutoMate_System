import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterSignupComponent } from './service-center-signup.component';

describe('ServiceCenterSignupComponent', () => {
  let component: ServiceCenterSignupComponent;
  let fixture: ComponentFixture<ServiceCenterSignupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterSignupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterSignupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
