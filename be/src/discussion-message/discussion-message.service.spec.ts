import { Test, TestingModule } from '@nestjs/testing';
import { DiscussionMessageService } from './discussion-message.service';
import { DiscussionThreadsService } from '../discussion-threads/discussion-threads.service';
import { MockDiscussionMessageRepository } from './port/out/mock-discussion-message.repository';
import { MockDiscussionThreadRepository } from '../discussion-threads/port/out/mock-discussion-thread.repository';
import { ServicesService } from '../services/services.service';
import { MockServiceRepository } from '../services/port/out/mock-service.repository';

describe('DiscussionMessageService', () => {
  let service: DiscussionMessageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscussionMessageService,
        DiscussionThreadsService,
        {
          provide: 'DISCUSSION_MESSAGE_REPOSITORY',
          useClass: MockDiscussionMessageRepository,
        },
        {
          provide: 'DISCUSSION_THREAD_REPOSITORY',
          useClass: MockDiscussionThreadRepository,
        },
        ServicesService,
        { provide: 'SERVICE_REPOSITORY', useClass: MockServiceRepository },
      ],
    }).compile();

    service = module.get<DiscussionMessageService>(DiscussionMessageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
