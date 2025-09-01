import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageVehiclesListComponent } from './manage-vehicles-list.component';

describe('ManageVehiclesListComponent', () => {
  let component: ManageVehiclesListComponent;
  let fixture: ComponentFixture<ManageVehiclesListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageVehiclesListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageVehiclesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
