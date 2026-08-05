import {BadRequestException } from '@nestjs/common';
// 마지막 글쓴이의 측/역할(writerRole)로 스레드의 다음 상태를 계산한다.
// pb 가 글을 쓰면 다음 차례는 pb5 확인(CHECK_PB5), 반대도 동일.
export function getNextStatus(writerRole: string): 'CHECK_PB5' | 'CHECK_PB' {
    // Guard clause: null/undefined/빈 값이면 .toLowerCase() TypeError 대신 명시적 400 을 던진다.
    if (!writerRole) throw new BadRequestException('writerRole is required');
    const role = writerRole.toLowerCase();
    if (role === 'pb') return 'CHECK_PB5';
    if (role === 'pb5') return 'CHECK_PB';
    throw new BadRequestException('Invalid writer role');
}
