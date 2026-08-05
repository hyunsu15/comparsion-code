import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DiscussionThreadsModule } from './discussion-threads/discussion-threads.module';
import { DiscussionMessageModule } from './discussion-message/discussion-message.module';
import { ServicesModule } from './services/services.module';
import { ChecklistModule } from './checklist/checklist.module';

// 환경 설정은 src/config 의 appConfig 싱글톤으로 관리한다(.env / ConfigModule 미사용).
@Module({
  imports: [
    DiscussionThreadsModule,
    DiscussionMessageModule,
    ServicesModule,
    ChecklistModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
