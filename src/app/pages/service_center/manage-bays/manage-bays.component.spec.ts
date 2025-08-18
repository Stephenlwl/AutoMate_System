import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageBaysComponent } from './manage-bays.component';

describe('ManageBaysComponent', () => {
  let component: ManageBaysComponent;
  let fixture: ComponentFixture<ManageBaysComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageBaysComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageBaysComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
