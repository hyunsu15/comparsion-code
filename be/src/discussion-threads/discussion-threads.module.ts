import { Module } from '@nestjs/common';
import { DiscussionThreadsService } from './discussion-threads.service';
import { DiscussionThreadsController } from './port/in/discussion-threads.controller';
import { GlobalDiscussionThreadsController } from './port/in/global-discussion-threads.controller';
import { DiscussionThreadRepository } from './port/out/discussion-thread.repository';
import { MockDiscussionThreadRepository } from './port/out/mock-discussion-thread.repository';
import { repositoryProvider } from '../common/repository.provider';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [ServicesModule],
  controllers: [DiscussionThreadsController, GlobalDiscussionThreadsController],
  providers: [
    DiscussionThreadsService,
    // PROFILE=MOCK → MockDiscussionThreadRepository, 그 외 → DiscussionThreadRepository(Oracle)
    repositoryProvider(
      'DISCUSSION_THREAD_REPOSITORY',
      DiscussionThreadRepository,
      MockDiscussionThreadRepository,
    ),
  ],
  exports: [DiscussionThreadsService],
})
export class DiscussionThreadsModule {}
