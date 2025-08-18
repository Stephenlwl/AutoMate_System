import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterServiceComponent } from './manage-services.component';

describe('ServiceCenterServiceComponent', () => {
  let component: ServiceCenterServiceComponent;
  let fixture: ComponentFixture<ServiceCenterServiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterServiceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterServiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
