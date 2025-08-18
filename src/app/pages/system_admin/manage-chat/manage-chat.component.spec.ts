import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManageChatComponent } from './manage-chat.component';

describe('ManageChatComponent', () => {
  let component: ManageChatComponent;
  let fixture: ComponentFixture<ManageChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageChatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
