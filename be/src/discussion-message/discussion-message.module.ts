import { Module } from '@nestjs/common';
import { DiscussionMessageService } from './discussion-message.service';
import { DiscussionMessageController } from './port/in/discussion-message.controller';
import { DiscussionMessageRepository } from './port/out/discussion-message.repository';
import { MockDiscussionMessageRepository } from './port/out/mock-discussion-message.repository';
import { DiscussionThreadsModule } from '../discussion-threads/discussion-threads.module';
import { repositoryProvider } from '../common/repository.provider';

@Module({
  imports: [DiscussionThreadsModule], // DiscussionThreadsService를 사용하기 위해 임포트
  controllers: [DiscussionMessageController],
  providers: [
    DiscussionMessageService,
    // PROFILE=MOCK → MockDiscussionMessageRepository, 그 외 → DiscussionMessageRepository(Oracle)
    repositoryProvider(
      'DISCUSSION_MESSAGE_REPOSITORY',
      DiscussionMessageRepository,
      MockDiscussionMessageRepository,
    ),
  ],
  exports: [DiscussionMessageService],
})
export class DiscussionMessageModule {}
