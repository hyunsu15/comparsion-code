import { PartialType } from '@nestjs/mapped-types';
import { CreateDiscussionThreadDto } from './create-discussion-thread.dto';

export class UpdateDiscussionThreadDto extends PartialType(CreateDiscussionThreadDto) {}
