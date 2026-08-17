import { Module } from '@nestjs/common';
import { HelpCenterController } from './help-center.controller';
import { HelpCenterService } from './help-center.service';

@Module({
  controllers: [HelpCenterController],
  providers: [HelpCenterService],
})
export class HelpCenterModule {}
