import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TowingPaymentComponent } from './towing-payment.component';

describe('TowingPaymentComponent', () => {
  let component: TowingPaymentComponent;
  let fixture: ComponentFixture<TowingPaymentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TowingPaymentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TowingPaymentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
