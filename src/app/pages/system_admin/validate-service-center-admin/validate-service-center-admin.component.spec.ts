import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateServiceCenterAdminComponent } from './validate-service-center-admin.component';

describe('ValidateServiceCenterAdminComponent', () => {
  let component: ValidateServiceCenterAdminComponent;
  let fixture: ComponentFixture<ValidateServiceCenterAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateServiceCenterAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateServiceCenterAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
