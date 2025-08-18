import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterLoginComponent } from './service-center-login.component';

describe('ServiceCenterLoginComponent', () => {
  let component: ServiceCenterLoginComponent;
  let fixture: ComponentFixture<ServiceCenterLoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterLoginComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
