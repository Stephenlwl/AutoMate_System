import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterTowingServicesComponent } from './manage-towing-services.component';

describe('ServiceCenterTowingServicesComponent', () => {
  let component: ServiceCenterTowingServicesComponent;
  let fixture: ComponentFixture<ServiceCenterTowingServicesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterTowingServicesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterTowingServicesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
