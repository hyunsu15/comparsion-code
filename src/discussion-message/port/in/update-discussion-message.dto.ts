import { PartialType } from '@nestjs/mapped-types';
import { CreateDiscussionMessageDto } from './create-discussion-message.dto';

export class UpdateDiscussionMessageDto extends PartialType(CreateDiscussionMessageDto) {}
