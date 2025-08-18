import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterProfileComponent } from './profile.component';

describe('ServiceCenterProfileComponent', () => {
  let component: ServiceCenterProfileComponent;
  let fixture: ComponentFixture<ServiceCenterProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterProfileComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
