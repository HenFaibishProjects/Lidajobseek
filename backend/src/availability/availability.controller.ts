import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AvailabilityService } from './availability.service';
import {
  AvailabilityBlockDto,
  AvailabilityCheckDto,
} from './dto/availability.dto';

@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  findAvailability(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() request: any,
  ) {
    return this.availabilityService.occupiedIntervals(
      from,
      to,
      request.user.userId,
    );
  }

  @Post('check')
  check(@Body() data: AvailabilityCheckDto, @Req() request: any) {
    return this.availabilityService.check(data, request.user.userId);
  }
}

@Controller('availability-blocks')
export class AvailabilityBlocksController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  findBlocks(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() request: any,
  ) {
    return this.availabilityService.findBlocks(from, to, request.user.userId);
  }

  @Get(':id')
  findBlock(@Param('id', ParseIntPipe) id: number, @Req() request: any) {
    return this.availabilityService.findBlock(id, request.user.userId);
  }

  @Post()
  create(@Body() data: AvailabilityBlockDto, @Req() request: any) {
    return this.availabilityService.createBlock(data, request.user.userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: AvailabilityBlockDto,
    @Req() request: any,
  ) {
    return this.availabilityService.updateBlock(id, data, request.user.userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: any) {
    return this.availabilityService.deleteBlock(id, request.user.userId);
  }
}
