import { validate } from 'class-validator';
import { SendMessageDto } from './send-message.dto';

describe('SendMessageDto', () => {
  it('rejects whitespace-only messages before they reach ShopAI', async () => {
    const dto = Object.assign(new SendMessageDto(), { message: ' \t\n ' });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('message');
  });
});
