import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateWorkshopAdminComponent } from './validate-workshop-admin.component';

describe('ValidateWorkshopAdminComponent', () => {
  let component: ValidateWorkshopAdminComponent;
  let fixture: ComponentFixture<ValidateWorkshopAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateWorkshopAdminComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateWorkshopAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
