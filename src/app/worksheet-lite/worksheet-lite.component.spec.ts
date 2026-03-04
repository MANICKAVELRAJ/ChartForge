import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorksheetLiteComponent } from './worksheet-lite.component';

describe('WorksheetLiteComponent', () => {
  let component: WorksheetLiteComponent;
  let fixture: ComponentFixture<WorksheetLiteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WorksheetLiteComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(WorksheetLiteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
