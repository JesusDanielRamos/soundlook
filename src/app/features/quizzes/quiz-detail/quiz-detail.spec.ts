import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuizDetail } from './quiz-detail';

describe('QuizDetail', () => {
  let component: QuizDetail;
  let fixture: ComponentFixture<QuizDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuizDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuizDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
