import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceInvoiceComponent } from './service-invoice.component';

describe('ServiceInvoiceComponent', () => {
  let component: ServiceInvoiceComponent;
  let fixture: ComponentFixture<ServiceInvoiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceInvoiceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceInvoiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
