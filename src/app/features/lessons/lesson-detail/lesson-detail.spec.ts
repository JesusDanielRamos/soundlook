import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LessonDetail } from './lesson-detail';

describe('LessonDetail', () => {
  let component: LessonDetail;
  let fixture: ComponentFixture<LessonDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LessonDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LessonDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
