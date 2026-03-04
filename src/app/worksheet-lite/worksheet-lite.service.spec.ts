import { TestBed } from '@angular/core/testing';

import { WorksheetLiteService } from './worksheet-lite.service';

describe('WorksheetLiteService', () => {
  let service: WorksheetLiteService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorksheetLiteService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
