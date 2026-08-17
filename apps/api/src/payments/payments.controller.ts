import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { PaymentsService } from './payments.service';

const PAYMENT_ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN];

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.createPayment(user.id, dto, idempotencyKey);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.confirmPayment(
      user.id,
      id,
      dto,
      idempotencyKey,
    );
  }

  @Public()
  @Post('webhook')
  webhook(
    @Body() dto: PaymentWebhookDto,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    return this.paymentsService.handleWebhook(signature, dto);
  }

  @Roles(...PAYMENT_ADMIN_ROLES)
  @Get('order/:orderId')
  listForOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.listForOrder(orderId);
  }
}
