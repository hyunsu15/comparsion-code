import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { DiscussionMessageService } from '../../discussion-message.service';
import { CreateDiscussionMessageDto } from './create-discussion-message.dto';
import { UpdateDiscussionMessageDto } from './update-discussion-message.dto';
import { UpdateReactionDto } from './update-reaction.dto';

@Controller('services/:serviceId/discussion-threads/:threadId/messages')
export class DiscussionMessageController {
  constructor(private readonly discussionMessageService: DiscussionMessageService) {}

  @Post()
  create(
    @Param('serviceId') serviceId: string,
    @Param('threadId', ParseIntPipe) threadId: number,
    @Body() createDiscussionMessageDto: CreateDiscussionMessageDto,
  ) {
    return this.discussionMessageService.create(
      threadId,
      createDiscussionMessageDto.writerRole,
      createDiscussionMessageDto.writerName,
      createDiscussionMessageDto.content,
    );
  }

  @Get()
  findAll(
    @Param('serviceId') serviceId: string,
    @Param('threadId', ParseIntPipe) threadId: number,
  ) {
    return this.discussionMessageService.findAll(threadId);
  }

  @Get(':id')
  findOne(
    @Param('serviceId') serviceId: string,
    @Param('threadId', ParseIntPipe) threadId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discussionMessageService.findOne(threadId, id);
  }

  @Patch(':id')
  update(
    @Param('serviceId') serviceId: string,
    @Param('threadId', ParseIntPipe) threadId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDiscussionMessageDto: UpdateDiscussionMessageDto,
  ) {
    return this.discussionMessageService.update(
      threadId,
      id,
      updateDiscussionMessageDto.content,
      updateDiscussionMessageDto.writerRole,
    );
  }

  // 메시지(댓글) 처리 리액션 변경 (확인중/조치완료/조치불필요, null=해제)
  @Patch(':id/reaction')
  updateReaction(
    @Param('serviceId') serviceId: string,
    @Param('threadId', ParseIntPipe) threadId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReactionDto,
  ) {
    return this.discussionMessageService.updateReaction(threadId, id, dto.reaction);
  }

  // 삭제 성공은 204 No Content. (없는 메시지는 서비스의 존재 확인에서 404)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('serviceId') serviceId: string,
    @Param('threadId', ParseIntPipe) threadId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discussionMessageService.remove(threadId, id);
  }
}
