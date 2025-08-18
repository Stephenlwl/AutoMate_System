import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ValidateUserAccountsComponent } from './validate-user-accounts.component';

describe('ValidateUserAccountsComponent', () => {
  let component: ValidateUserAccountsComponent;
  let fixture: ComponentFixture<ValidateUserAccountsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ValidateUserAccountsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ValidateUserAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
