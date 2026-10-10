import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AvailabilityBlock } from './availability-block.entity';
import {
  AvailabilityController,
  AvailabilityBlocksController,
} from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [MikroOrmModule.forFeature([AvailabilityBlock])],
  controllers: [AvailabilityController, AvailabilityBlocksController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
