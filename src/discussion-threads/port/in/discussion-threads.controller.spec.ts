import { Test, TestingModule } from '@nestjs/testing';
import { DiscussionThreadsController } from './discussion-threads.controller';
import { DiscussionThreadsService } from '../../discussion-threads.service';
import { MockDiscussionThreadRepository } from '../out/mock-discussion-thread.repository';
import { ServicesService } from '../../../services/services.service';
import { MockServiceRepository } from '../../../services/port/out/mock-service.repository';

describe('DiscussionThreadsController', () => {
  let controller: DiscussionThreadsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscussionThreadsController],
      providers: [
        DiscussionThreadsService,
        {
          provide: 'DISCUSSION_THREAD_REPOSITORY',
          useClass: MockDiscussionThreadRepository,
        },
        ServicesService,
        { provide: 'SERVICE_REPOSITORY', useClass: MockServiceRepository },
      ],
    }).compile();

    controller = module.get<DiscussionThreadsController>(DiscussionThreadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
