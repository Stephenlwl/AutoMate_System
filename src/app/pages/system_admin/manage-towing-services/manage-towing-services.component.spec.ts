import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageTowingServicesComponent } from './manage-towing-services.component';

describe('ManageTowingServicesComponent', () => {
  let component: ManageTowingServicesComponent;
  let fixture: ComponentFixture<ManageTowingServicesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageTowingServicesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageTowingServicesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
