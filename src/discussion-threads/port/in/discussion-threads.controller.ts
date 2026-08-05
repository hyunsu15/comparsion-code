import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { DiscussionThreadsService } from '../../discussion-threads.service';
import { CreateDiscussionThreadDto } from './create-discussion-thread.dto';
import { UpdateDiscussionThreadDto } from './update-discussion-thread.dto';

@Controller('services/:serviceId/discussion-threads')
export class DiscussionThreadsController {
  constructor(private readonly discussionThreadsService: DiscussionThreadsService) {}

  @Post()
  create(
    @Param('serviceId') serviceId: string,
    @Body() createDiscussionThreadDto: CreateDiscussionThreadDto
  ) {
    return this.discussionThreadsService.create(
      createDiscussionThreadDto.content,
      serviceId,
      createDiscussionThreadDto.writerRole,
      createDiscussionThreadDto.writerName,
      createDiscussionThreadDto.codeKind,
      createDiscussionThreadDto.location,
      createDiscussionThreadDto.opinionType,
    );
  }

  @Get()
  findAll(@Param('serviceId') serviceId: string, @Query('status') status?: string) {
    return this.discussionThreadsService.findAll(serviceId, status);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.discussionThreadsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDiscussionThreadDto: UpdateDiscussionThreadDto,
  ) {
    return this.discussionThreadsService.update(
      id,
      updateDiscussionThreadDto.content,
      updateDiscussionThreadDto.writerRole,
    );
  }

  @Post(':id/close')
  closeThread(@Param('id', ParseIntPipe) id: number) {
    return this.discussionThreadsService.closeThread(id);
  }

  // 삭제 성공은 204 No Content. (멱등 — 이미 없는 스레드도 성공으로 본다)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.discussionThreadsService.remove(id);
  }
}
