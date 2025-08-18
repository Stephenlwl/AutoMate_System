import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterPaymentsComponent } from './manage-payments.component';

describe('ServiceCenterPaymentsComponent', () => {
  let component: ServiceCenterPaymentsComponent;
  let fixture: ComponentFixture<ServiceCenterPaymentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterPaymentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterPaymentsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
