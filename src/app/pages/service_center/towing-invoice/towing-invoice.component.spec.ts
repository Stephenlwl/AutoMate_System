import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TowingInvoiceComponent } from './towing-invoice.component';

describe('TowingInvoiceComponent', () => {
  let component: TowingInvoiceComponent;
  let fixture: ComponentFixture<TowingInvoiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TowingInvoiceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TowingInvoiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
