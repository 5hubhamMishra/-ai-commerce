import { TicketStatus } from '@prisma/client';
import { SupportService } from './support.service';

describe('SupportService status claims', () => {
  it('rejects a stale explicit ticket status update', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const audit = { record: jest.fn() };
    const notifications = { create: jest.fn() };
    const service = new SupportService(
      {
        supportTicket: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ticket-1',
            userId: 'user-1',
            subject: 'Order question',
            category: 'ORDER',
            status: TicketStatus.OPEN,
            messages: [],
          }),
          updateMany,
        },
      } as never,
      audit as never,
      notifications as never,
    );

    await expect(
      service.updateStatus('admin-1', 'ticket-1', {
        status: TicketStatus.IN_PROGRESS,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TICKET_STATUS_CHANGED' }),
    });
    expect(notifications.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
