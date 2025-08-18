import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterDashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: ServiceCenterDashboardComponent;
  let fixture: ComponentFixture<ServiceCenterDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterDashboardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
