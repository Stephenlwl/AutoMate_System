import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterSidebarComponent } from './sidebar.component';

describe('ServiceCenterSidebarComponent', () => {
  let component: ServiceCenterSidebarComponent;
  let fixture: ComponentFixture<ServiceCenterSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterSidebarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
