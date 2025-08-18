import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ServiceCenterChatComponent } from './chat-support.component';

describe('ServiceCenterChatComponent', () => {
  let component: ServiceCenterChatComponent;
  let fixture: ComponentFixture<ServiceCenterChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceCenterChatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ServiceCenterChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
