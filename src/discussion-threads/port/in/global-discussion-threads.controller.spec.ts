import { Test, TestingModule } from '@nestjs/testing';
import { GlobalDiscussionThreadsController } from './global-discussion-threads.controller';
import { DiscussionThreadsService } from '../../discussion-threads.service';

describe('GlobalDiscussionThreadsController', () => {
  let controller: GlobalDiscussionThreadsController;
  let service: { findAllPaged: jest.Mock };

  beforeEach(async () => {
    service = { findAllPaged: jest.fn().mockResolvedValue({ items: [], page: 1, size: 20, totalCount: 0 }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GlobalDiscussionThreadsController],
      providers: [{ provide: DiscussionThreadsService, useValue: service }],
    }).compile();
    controller = module.get<GlobalDiscussionThreadsController>(GlobalDiscussionThreadsController);
  });

  it('기본값: page=1, size=20, 분류/유형 undefined', async () => {
    await controller.findAllPaged();
    expect(service.findAllPaged).toHaveBeenCalledWith({
      bigCategory: undefined, middleCategory: undefined, opinionType: undefined, page: 1, size: 20,
    });
  });

  it('size 상한 100 으로 보정', async () => {
    await controller.findAllPaged(undefined, undefined, undefined, '2', '999');
    expect(service.findAllPaged).toHaveBeenCalledWith(expect.objectContaining({ page: 2, size: 100 }));
  });

  it('잘못된 page/size 는 기본값(page=1, size=20)', async () => {
    await controller.findAllPaged(undefined, undefined, undefined, '0', 'abc');
    expect(service.findAllPaged).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 20 }));
  });

  it('빈 문자열 분류/유형은 undefined 로 전달', async () => {
    await controller.findAllPaged('', '', '', '1', '20');
    expect(service.findAllPaged).toHaveBeenCalledWith({
      bigCategory: undefined, middleCategory: undefined, opinionType: undefined, page: 1, size: 20,
    });
  });
});
