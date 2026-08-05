import { Test, TestingModule } from '@nestjs/testing';
import { DiscussionMessageController } from './discussion-message.controller';
import { DiscussionMessageService } from '../../discussion-message.service';
import { DiscussionThreadsService } from '../../../discussion-threads/discussion-threads.service';
import { MockDiscussionMessageRepository } from '../out/mock-discussion-message.repository';
import { MockDiscussionThreadRepository } from '../../../discussion-threads/port/out/mock-discussion-thread.repository';
import { ServicesService } from '../../../services/services.service';
import { MockServiceRepository } from '../../../services/port/out/mock-service.repository';

describe('DiscussionMessageController', () => {
  let controller: DiscussionMessageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscussionMessageController],
      providers: [
        DiscussionMessageService,
        { provide: 'DISCUSSION_MESSAGE_REPOSITORY', useClass: MockDiscussionMessageRepository },
        DiscussionThreadsService,
        { provide: 'DISCUSSION_THREAD_REPOSITORY', useClass: MockDiscussionThreadRepository },
        ServicesService,
        { provide: 'SERVICE_REPOSITORY', useClass: MockServiceRepository },
      ],
    }).compile();

    controller = module.get<DiscussionMessageController>(DiscussionMessageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
